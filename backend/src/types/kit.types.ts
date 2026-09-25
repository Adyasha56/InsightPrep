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

export interface Question {
  id: string;
  prompt: string;
  answer_outline: string;
  difficulty: QuestionDifficulty;
  category: QuestionCategory;
  requirement_ids: string[];
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  requirement_ids: string[];
}

export interface CompanyBrief {
  summary: string;
  what_they_do: string;
  sources: string[];
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
