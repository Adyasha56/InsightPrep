// Mirrors backend/src/types/kit.types.ts. Field names stay snake_case where
// the backend uses snake_case (source, company_brief, requirement_ids, ...)
// because these are wire-format types, not UI-layer conveniences — renaming
// them here would just create a silent mapping layer to keep in sync.

export type RequirementKind = "technical" | "behavioural" | "domain";
export type RequirementPriority = "must" | "nice";

export interface Requirement {
  id: string;
  text: string;
  kind: RequirementKind;
  priority: RequirementPriority;
}

export type QuestionCategory = "technical" | "behavioural" | "system-design" | "company-fit";
export type QuestionDifficulty = 1 | 2 | 3;

// "generated" content came from Gemini; "user" content was created by the
// person editing the kit. `edited` is computed server-side (never trusted
// from the client) and marks generated content that's since been hand-edited
// — both are protected from a future regeneration pass.
export type ContentOrigin = "generated" | "user";

export interface Question {
  id: string;
  prompt: string;
  answer_outline: string;
  difficulty: QuestionDifficulty;
  category: QuestionCategory;
  requirement_ids: string[];
  origin: ContentOrigin;
  edited: boolean;
}

// Phase 12: self-reported practice confidence. null = never practiced.
export type FlashcardConfidence = "low" | "medium" | "high" | null;

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  requirement_ids: string[];
  origin: ContentOrigin;
  edited: boolean;
  confidence: FlashcardConfidence;
}

export interface CompanyBrief {
  summary: string;
  what_they_do: string;
  sources: string[];
  edited: boolean;
}

export interface Role {
  title: string;
  seniority: string;
  responsibilities: string[];
  requirements: Requirement[];
}

export interface ScheduleDay {
  day: number;
  focus: string;
  question_ids: string[];
  minutes: number;
}

export interface Schedule {
  days_available: number;
  days: ScheduleDay[];
}

export interface Coverage {
  uncovered_requirement_ids: string[];
  passes: number;
}

export interface KitSource {
  job_description: string;
  company_url: string;
  days_available: number;
}

export type GenerationStatus = "idle" | "researching" | "generating" | "completed" | "failed";

export interface GenerationError {
  code: string;
  message: string;
}

// The persisted kit document as returned by the API — a DraftKit plus
// database/ownership/status metadata.
export interface Kit {
  _id: string;
  owner: string;
  generationStatus: GenerationStatus;
  generationError?: GenerationError;
  source: KitSource;
  company_brief: CompanyBrief;
  role: Role;
  questions: Question[];
  flashcards: Flashcard[];
  schedule: Schedule;
  coverage: Coverage;
  createdAt: string;
  updatedAt: string;
}

// Lean projection returned by GET /api/kits (list) — excludes the heavy
// generated arrays a list view never renders.
export interface KitListItem {
  _id: string;
  generationStatus: GenerationStatus;
  generationError?: GenerationError;
  source: KitSource;
  role: { title: string };
  coverage: { uncovered_requirement_ids: string[] };
  createdAt: string;
  updatedAt: string;
}

export interface CreateKitInput {
  job_description: string;
  company_url: string;
  days_available: number;
}

// PATCH /api/kits/:kitId body (the builder). `id` present = edit that
// existing item; absent = create a new user-owned one; an existing id simply
// left out of the array = delete it. Array order becomes the new stored
// order, which is how reordering and category moves are expressed.
export interface UpdateQuestionInput {
  id?: string;
  prompt: string;
  answer_outline: string;
  difficulty: QuestionDifficulty;
  category: QuestionCategory;
}

export interface UpdateFlashcardInput {
  id?: string;
  front: string;
  back: string;
}

export interface UpdateCompanyBriefInput {
  summary: string;
  what_they_do: string;
}

export interface UpdateKitInput {
  company_brief?: UpdateCompanyBriefInput;
  questions?: UpdateQuestionInput[];
  flashcards?: UpdateFlashcardInput[];
}

// POST /api/kits/:kitId/regenerate body. Exactly one section per request —
// never the whole kit — mirroring the backend's discriminated union.
export type RegenerateKitInput =
  | { target: "company_brief" }
  | { target: "schedule" }
  | { target: "category"; category: QuestionCategory };

// PATCH /api/kits/:kitId/flashcards/:flashcardId/practice body.
export interface RecordFlashcardPracticeInput {
  confidence: NonNullable<FlashcardConfidence>;
}
