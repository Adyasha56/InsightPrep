import { Types } from "mongoose";
import { Kit, KitDocument } from "../models/kit.model";
import { AppError } from "../utils/AppError";
import { ErrorCode } from "../types/error-code.types";
import { DraftKit, GenerationError, GenerationStatus } from "../types/kit.types";

export interface CreateKitInput {
  job_description: string;
  company_url: string;
  days_available: number;
}

export async function createKit(ownerId: string, input: CreateKitInput): Promise<KitDocument> {
  return Kit.create({
    owner: ownerId,
    generationStatus: "idle",
    source: input,
    company_brief: { summary: "", what_they_do: "", sources: [], edited: false },
    role: { title: "", seniority: "", responsibilities: [], requirements: [] },
    questions: [],
    flashcards: [],
    schedule: { days_available: input.days_available, days: [] },
    coverage: { uncovered_requirement_ids: [], passes: 0 },
  });
}

// Lean projection for a dashboard list — excludes the heavy generated
// arrays (questions, flashcards, requirements, schedule days) that a list
// view never renders.
export async function listKits(ownerId: string): Promise<KitDocument[]> {
  return Kit.find({ owner: ownerId })
    .select("generationStatus generationError source role.title coverage.uncovered_requirement_ids createdAt updatedAt")
    .sort({ updatedAt: -1 });
}

// Loads a kit and enforces ownership — a user must never be able to read or
// generate another user's kit (RULES.md section 9).
export async function getOwnedKit(ownerId: string, kitId: string): Promise<KitDocument> {
  if (!Types.ObjectId.isValid(kitId)) {
    throw new AppError(ErrorCode.KIT_NOT_FOUND, "Kit not found.", 404);
  }

  const kit = await Kit.findById(kitId);
  if (!kit) {
    throw new AppError(ErrorCode.KIT_NOT_FOUND, "Kit not found.", 404);
  }
  if (kit.owner.toString() !== ownerId) {
    throw new AppError(ErrorCode.UNAUTHORIZED_ACCESS, "You do not have access to this kit.", 403);
  }
  return kit;
}

export async function setGenerationStatus(kitId: string, status: GenerationStatus): Promise<void> {
  await Kit.updateOne({ _id: kitId }, { generationStatus: status, $unset: { generationError: "" } });
}

export async function saveGeneratedDraft(kitId: string, draft: DraftKit): Promise<KitDocument> {
  const kit = await Kit.findByIdAndUpdate(
    kitId,
    {
      company_brief: draft.company_brief,
      role: draft.role,
      questions: draft.questions,
      flashcards: draft.flashcards,
      schedule: draft.schedule,
      coverage: draft.coverage,
      generationStatus: "completed",
      $unset: { generationError: "" },
    },
    { returnDocument: "after" }
  );
  if (!kit) {
    throw new AppError(ErrorCode.KIT_NOT_FOUND, "Kit not found.", 404);
  }
  return kit;
}

export async function markGenerationFailed(kitId: string, error: GenerationError): Promise<void> {
  await Kit.updateOne({ _id: kitId }, { generationStatus: "failed", generationError: error });
}
