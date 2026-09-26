// Field names below use snake_case because they must match the assessment's
// mandated kit JSON structure (RULES.md section 13) exactly. Do not rename
// them to camelCase, even though the rest of this codebase uses camelCase.

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

// Content-state model (Phase 10): "user" content is always kept as-is by a
// future regenerator; "generated" content that has since been hand-edited
// (edited: true) is likewise protected. Only generated + never-edited items
// are safe to replace on regeneration. `edited` is always computed
// server-side by diffing against the stored value — never trusted from the
// client — so it can't be spoofed or missed by a frontend bug.
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

// Phase 12: self-reported recall confidence from a practice session. `null`
// means never practiced ("uncovered"); any other value means "covered".
// Lives directly on the flashcard rather than a separate progress store, so
// deleting or (never) regenerating a flashcard can't orphan practice state.
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
  // No `origin` here — there is exactly one brief per kit, never a
  // user-created "second" one — but it can still be hand-edited.
  edited: boolean;
}

export interface Role {
  title: string;
  seniority: string;
  responsibilities: string[];
  // The canonical requirement set, echoed from requirement extraction —
  // role analysis must not invent a second set (RULES.md section 12).
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

// The generated draft kit — matches the assessment's required top-level
// structure exactly: source, company_brief, role, questions, flashcards,
// schedule, coverage.
export interface DraftKit {
  source: KitSource;
  company_brief: CompanyBrief;
  role: Role;
  questions: Question[];
  flashcards: Flashcard[];
  schedule: Schedule;
  coverage: Coverage;
}

export type GenerationStatus = "idle" | "researching" | "generating" | "completed" | "failed";

export interface GenerationError {
  code: string;
  message: string;
}
