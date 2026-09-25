import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { sendSuccess } from "../utils/apiResponse";
import * as kitService from "../services/kit.service";
import { researchCompany } from "../services/research/company-research.service";
import { generateDraftKit } from "../services/generation/kit-generation.service";
import { validateDraftKit } from "../validators/kit.validator";
import { AppError } from "../utils/AppError";
import { ErrorCode } from "../types/error-code.types";
import { env } from "../config/env";

export const createKit = asyncHandler(async (req: Request, res: Response) => {
  const kit = await kitService.createKit(req.user!.id, req.body);
  sendSuccess(res, { kit }, 201);
});

export const getKit = asyncHandler(async (req: Request, res: Response) => {
  const kit = await kitService.getOwnedKit(req.user!.id, req.params.kitId as string);
  sendSuccess(res, { kit });
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
