import { Question, Requirement } from "../../types/kit.types";

// The canonical Schedule/ScheduleDay shapes live in types/kit.types.ts
// (they're part of the required kit structure, not scheduler-internal) —
// only this service's own input/working types belong here.
export interface CreateScheduleInput {
  daysAvailable: number;
  questions: Question[];
  requirements: Requirement[];
}

// A question annotated with its deterministic priority score, computed
// once and reused for both MUST-coverage selection and day distribution so
// the two stay consistent with each other.
export interface ScoredQuestion {
  question: Question;
  score: number;
}
