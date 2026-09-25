import { Question, QuestionCategory, QuestionDifficulty, Requirement } from "../../types/kit.types";
import { ScoredQuestion } from "./schedule.types";

// Deterministic minute budget per difficulty — never asked of Gemini. A
// foundational question is a quick warm-up; an advanced one needs room to
// reason through trade-offs out loud, as it would in a real interview.
const MINUTES_BY_DIFFICULTY: Record<QuestionDifficulty, number> = { 1: 10, 2: 15, 3: 20 };

export function minutesForDifficulty(difficulty: QuestionDifficulty): number {
  return MINUTES_BY_DIFFICULTY[difficulty];
}

// Weights are deliberately an order of magnitude apart so each tier
// strictly dominates the next: covering one more MUST requirement always
// outranks any difficulty difference, and difficulty always outranks the
// requirement-count tiebreaker. See README "Deterministic Schedule
// Allocation" for the worked rationale.
const MUST_COVERAGE_WEIGHT = 100;
const DIFFICULTY_WEIGHT = 10;
const REQUIREMENT_COUNT_WEIGHT = 1;

// Duplicate ids inside a single question's requirement_ids (RULES.md
// section 11(I)) are deduped via the Set below before counting, so they
// can't inflate a question's score.
export function scoreQuestion(question: Question, requirementsById: Map<string, Requirement>): number {
  const uniqueRequirementIds = new Set(question.requirement_ids);
  let mustCount = 0;
  let totalCount = 0;

  uniqueRequirementIds.forEach((id) => {
    const requirement = requirementsById.get(id);
    // Validation upstream already rejects unknown requirement ids; ignore
    // defensively rather than let a stray reference skew scoring.
    if (!requirement) return;
    totalCount += 1;
    if (requirement.priority === "must") {
      mustCount += 1;
    }
  });

  return mustCount * MUST_COVERAGE_WEIGHT + question.difficulty * DIFFICULTY_WEIGHT + totalCount * REQUIREMENT_COUNT_WEIGHT;
}

// Question ids are always assigned sequentially by application code
// (q1, q2, ...), so comparing their numeric suffix is a safe, deterministic
// tie-breaker — a plain string compare would sort "q10" before "q2".
export function compareQuestionIdsNumerically(a: string, b: string): number {
  const numA = parseInt(a.replace(/\D/g, ""), 10);
  const numB = parseInt(b.replace(/\D/g, ""), 10);
  return numA - numB;
}

export function sortByScoreDescending(scored: ScoredQuestion[]): ScoredQuestion[] {
  return [...scored].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return compareQuestionIdsNumerically(a.question.id, b.question.id);
  });
}

const CATEGORY_FOCUS_LABELS: Record<QuestionCategory, string> = {
  technical: "Technical fundamentals",
  "system-design": "System design and architecture",
  behavioural: "Behavioural",
  "company-fit": "Company fit",
};

// Fixed iteration order (not first-seen order) so the same set of
// categories on a day always produces the same focus string, regardless of
// which question happened to land first in that day's chunk.
const CATEGORY_FOCUS_ORDER: QuestionCategory[] = ["technical", "system-design", "behavioural", "company-fit"];

export function buildFocus(dayQuestions: Question[]): string {
  if (dayQuestions.length === 0) {
    return "Review and consolidation";
  }

  const present = new Set(dayQuestions.map((question) => question.category));
  return CATEGORY_FOCUS_ORDER.filter((category) => present.has(category))
    .map((category) => CATEGORY_FOCUS_LABELS[category])
    .join(" & ");
}
