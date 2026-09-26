import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { sendSuccess } from "../utils/apiResponse";
import * as kitService from "../services/kit.service";
import { researchCompany } from "../services/research/company-research.service";
import { generateDraftKit } from "../services/generation/kit-generation.service";
import { buildUpdatedDraftKit } from "../services/kit-update.service";
import { buildRegeneratedDraftKit } from "../services/generation/kit-regeneration.service";
import { recordFlashcardConfidence } from "../services/kit-practice.service";
import { validateDraftKit } from "../validators/kit.validator";
import { AppError } from "../utils/AppError";
import { ErrorCode } from "../types/error-code.types";
import { env } from "../config/env";

export const createKit = asyncHandler(async (req: Request, res: Response) => {
  const kit = await kitService.createKit(req.user!.id, req.body);
  sendSuccess(res, { kit }, 201);
});

export const listKits = asyncHandler(async (req: Request, res: Response) => {
  const kits = await kitService.listKits(req.user!.id);
  sendSuccess(res, { kits });
});

export const getKit = asyncHandler(async (req: Request, res: Response) => {
  const kit = await kitService.getOwnedKit(req.user!.id, req.params.kitId as string);
  sendSuccess(res, { kit });
});

// Builder edits: company brief / questions / flashcards. Only meaningful
// once a kit has actually been generated — editing an empty, ungenerated
// kit has nothing to reconcile against.
export const updateKit = asyncHandler(async (req: Request, res: Response) => {
  const kit = await kitService.getOwnedKit(req.user!.id, req.params.kitId as string);

  if (kit.generationStatus !== "completed") {
    throw AppError.validation("This kit has not been generated yet, so it can't be edited.");
  }

  const draft = buildUpdatedDraftKit(kit, req.body);
  const updated = await kitService.saveGeneratedDraft(kit._id.toString(), draft);

  sendSuccess(res, { kit: updated });
});

// Regenerates one section of an already-completed kit (Phase 11): the
// company brief, one question category, or the schedule. Unlike generateKit
// below, a failure here never touches generationStatus — nothing is
// persisted until the new draft has already validated successfully, so the
// kit's existing (valid) content is never at risk, and there is no reason to
// knock a working kit out of "completed" over a failed regeneration attempt.
export const regenerateKit = asyncHandler(async (req: Request, res: Response) => {
  const kit = await kitService.getOwnedKit(req.user!.id, req.params.kitId as string);

  if (kit.generationStatus !== "completed") {
    throw AppError.validation("This kit has not been generated yet, so it can't be regenerated.");
  }

  const draft = await buildRegeneratedDraftKit(kit, req.body);
  const updated = await kitService.saveGeneratedDraft(kit._id.toString(), draft);

  sendSuccess(res, { kit: updated });
});

// Records self-reported recall confidence for one flashcard (Phase 12).
// Intentionally not part of the Phase 10 PATCH — this isn't a content edit.
export const recordPractice = asyncHandler(async (req: Request, res: Response) => {
  const kit = await kitService.getOwnedKit(req.user!.id, req.params.kitId as string);

  if (kit.generationStatus !== "completed") {
    throw AppError.validation("This kit has not been generated yet, so there's nothing to practice.");
  }

  const draft = recordFlashcardConfidence(kit, req.params.flashcardId as string, req.body.confidence);
  const updated = await kitService.saveGeneratedDraft(kit._id.toString(), draft);

  sendSuccess(res, { kit: updated });
});

// Runs Phase 4 research + Phase 5 generation for an existing kit and
// persists the first-pass draft. Coverage/schedule remain placeholders —
// deterministic allocation is a later phase (RULES.md section 23).
export const generateKit = asyncHandler(async (req: Request, res: Response) => {
  const kit = await kitService.getOwnedKit(req.user!.id, req.params.kitId as string);
  const kitId = kit._id.toString();

  try {
    await kitService.setGenerationStatus(kitId, "researching");
    const research = await researchCompany(kit.source.company_url, {
      allowLocalTargets: env.ALLOW_LOCAL_RESEARCH_TARGETS,
    });

    await kitService.setGenerationStatus(kitId, "generating");
    const draft = await generateDraftKit({
      jobDescription: kit.source.job_description,
      companyUrl: kit.source.company_url,
      daysAvailable: kit.source.days_available,
      research,
    });

    const validated = validateDraftKit(draft);
    const updated = await kitService.saveGeneratedDraft(kitId, validated);

    sendSuccess(res, { kit: updated });
  } catch (error) {
    const structuredError =
      error instanceof AppError
        ? { code: error.code, message: error.message }
        : { code: ErrorCode.GENERATION_FAILED, message: "Kit generation failed unexpectedly." };

    await kitService.markGenerationFailed(kitId, structuredError);
    throw error;
  }
});
