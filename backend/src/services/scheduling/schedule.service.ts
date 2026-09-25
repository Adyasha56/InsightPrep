import { Question, Schedule, ScheduleDay } from "../../types/kit.types";
import { AppError } from "../../utils/AppError";
import { ErrorCode } from "../../types/error-code.types";
import { CreateScheduleInput, ScoredQuestion } from "./schedule.types";
import { buildFocus, minutesForDifficulty, scoreQuestion, sortByScoreDescending } from "./schedule.utils";

// Kept as an independent constant rather than importing
// validators/kit.validator.ts's matching `.max(60)` cap, so this service
// stays free of any HTTP/validation-layer dependency and remains
// independently testable (RULES.md section 4/17). Must be kept in sync
// with createKitRequestSchema if that cap ever changes.
export const MAX_SCHEDULE_DAYS = 60;

// Greedily walks the priority-sorted question list once, picking any
// question that still covers an unaddressed MUST requirement. Because the
// list is already sorted by score — which itself weights MUST coverage far
// above everything else — this single pass naturally prefers questions
// that cover multiple MUST requirements, without a more expensive
// iterative set-cover search (RULES.md section 6). This deliberately does
// not attempt true minimum set cover; it is a documented simplification
// that stays easy to explain and test.
function selectMustCoverageQuestionIds(sorted: ScoredQuestion[], mustRequirementIds: Set<string>): Set<string> {
  const remaining = new Set(mustRequirementIds);
  const selected = new Set<string>();

  for (const { question } of sorted) {
    if (remaining.size === 0) break;

    const coversRemaining = question.requirement_ids.some((id) => remaining.has(id));
    if (!coversRemaining) continue;

    selected.add(question.id);
    question.requirement_ids.forEach((id) => remaining.delete(id));
  }

  return selected;
}

// Splits an already priority-ordered list into `daysAvailable` contiguous,
// near-equal chunks — day 1 always gets the front of the list (the
// highest-priority material), and any remainder is spread across the
// earliest days rather than piled onto day 1 alone. When there are fewer
// questions than days, the later days simply receive none (RULES.md
// section 11(F)) — a natural consequence of the arithmetic, not a special
// case.
function distributeAcrossDays(orderedQuestions: Question[], daysAvailable: number): ScheduleDay[] {
  const total = orderedQuestions.length;
  const baseCount = Math.floor(total / daysAvailable);
  const remainder = total % daysAvailable;

  const days: ScheduleDay[] = [];
  let cursor = 0;

  for (let day = 1; day <= daysAvailable; day += 1) {
    const countForDay = baseCount + (day <= remainder ? 1 : 0);
    const dayQuestions = orderedQuestions.slice(cursor, cursor + countForDay);
    cursor += countForDay;

    days.push({
      day,
      focus: buildFocus(dayQuestions),
      question_ids: dayQuestions.map((question) => question.id),
      minutes: dayQuestions.reduce((sum, question) => sum + minutesForDifficulty(question.difficulty), 0),
    });
  }

  return days;
}

// Deterministically transforms the final, coverage-checked question set
// into a day-by-day study schedule. Pure and synchronous — no Gemini, no
// HTTP, no database access — so the same input always produces the same
// output. Gemini already decided question content/difficulty/category
// during generation; this function only decides placement, order, and
// timing, which the assignment requires to be application logic.
export function createSchedule(input: CreateScheduleInput): Schedule {
  if (!Number.isInteger(input.daysAvailable) || input.daysAvailable < 1 || input.daysAvailable > MAX_SCHEDULE_DAYS) {
    throw new AppError(
      ErrorCode.SCHEDULE_INVALID_INPUT,
      `daysAvailable must be an integer between 1 and ${MAX_SCHEDULE_DAYS}.`,
      400
    );
  }

  const requirementsById = new Map(input.requirements.map((requirement) => [requirement.id, requirement]));
  const scored: ScoredQuestion[] = input.questions.map((question) => ({
    question,
    score: scoreQuestion(question, requirementsById),
  }));
  const sorted = sortByScoreDescending(scored);

  const mustRequirementIds = new Set(
    input.requirements.filter((requirement) => requirement.priority === "must").map((requirement) => requirement.id)
  );
  const requiredQuestionIds = selectMustCoverageQuestionIds(sorted, mustRequirementIds);

  // Required (MUST-coverage) questions are pulled to the front of the
  // schedule ahead of everything else, per RULES.md section 6 step 5-6;
  // `remaining` keeps its existing score order since it's just `sorted`
  // with the required entries removed.
  const required = sorted.filter((item) => requiredQuestionIds.has(item.question.id));
  const remaining = sorted.filter((item) => !requiredQuestionIds.has(item.question.id));
  const orderedQuestions = [...required, ...remaining].map((item) => item.question);

  return {
    days_available: input.daysAvailable,
    days: distributeAcrossDays(orderedQuestions, input.daysAvailable),
  };
}
