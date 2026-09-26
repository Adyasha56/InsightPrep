import { KitDocument } from "../models/kit.model";
import { checkCoverage } from "./validation/coverage.service";
import { buildFocus, minutesForDifficulty } from "./scheduling/schedule.utils";
import {
  UpdateFlashcardInput,
  UpdateKitRequest,
  UpdateQuestionInput,
  validateDraftKit,
} from "../validators/kit.validator";
import { AppError } from "../utils/AppError";
import { ErrorCode } from "../types/error-code.types";
import { CompanyBrief, DraftKit, Flashcard, Question, Schedule } from "../types/kit.types";

// Mints a new id in a prefix's own namespace by continuing past whatever
// the highest existing suffix is — collision-free without a counter stored
// anywhere, and independent of the "q"/"f" namespace generation uses, so a
// user-created item can never collide with a generated one.
function nextId(existingIds: string[], prefix: string): string {
  let max = 0;
  for (const id of existingIds) {
    if (!id.startsWith(prefix)) continue;
    const suffix = Number(id.slice(prefix.length));
    if (Number.isInteger(suffix) && suffix > max) max = suffix;
  }
  return `${prefix}${max + 1}`;
}

// Reconciles the incoming question list against what's stored. An item
// with an `id` matching an existing question is an edit (diffed against
// the stored version to compute `edited` — never trusted from the client);
// an item with no `id` is a brand-new user-created question; any existing
// id simply missing from the incoming array is a deletion. Array order in
// `incoming` becomes the new stored order, which is how reordering and
// category moves are expressed — no separate "move" operation needed.
function reconcileQuestions(existing: Question[], incoming: UpdateQuestionInput[]): Question[] {
  const existingById = new Map(existing.map((question) => [question.id, question]));
  const mintedIds = existing.map((question) => question.id);

  return incoming.map((item) => {
    if (item.id) {
      const previous = existingById.get(item.id);
      if (!previous) {
        throw new AppError(ErrorCode.INVALID_KIT, `Unknown question id "${item.id}".`, 400);
      }
      const changed =
        previous.prompt !== item.prompt ||
        previous.answer_outline !== item.answer_outline ||
        previous.difficulty !== item.difficulty ||
        previous.category !== item.category;

      return {
        ...previous,
        prompt: item.prompt,
        answer_outline: item.answer_outline,
        difficulty: item.difficulty,
        category: item.category,
        edited: previous.edited || changed,
      };
    }

    const id = nextId(mintedIds, "u");
    mintedIds.push(id);
    return {
      id,
      prompt: item.prompt,
      answer_outline: item.answer_outline,
      difficulty: item.difficulty,
      category: item.category,
      // Requirement links aren't editable from the builder yet (see
      // README) — a user-created question simply starts unlinked.
      requirement_ids: [],
      origin: "user",
      edited: false,
    };
  });
}

function reconcileFlashcards(existing: Flashcard[], incoming: UpdateFlashcardInput[]): Flashcard[] {
  const existingById = new Map(existing.map((flashcard) => [flashcard.id, flashcard]));
  const mintedIds = existing.map((flashcard) => flashcard.id);

  return incoming.map((item) => {
    if (item.id) {
      const previous = existingById.get(item.id);
      if (!previous) {
        throw new AppError(ErrorCode.INVALID_KIT, `Unknown flashcard id "${item.id}".`, 400);
      }
      const changed = previous.front !== item.front || previous.back !== item.back;

      return { ...previous, front: item.front, back: item.back, edited: previous.edited || changed };
    }

    const id = nextId(mintedIds, "u");
    mintedIds.push(id);
    return { id, front: item.front, back: item.back, requirement_ids: [], origin: "user", edited: false, confidence: null };
  });
}

function reconcileCompanyBrief(existing: CompanyBrief, incoming: { summary: string; what_they_do: string }): CompanyBrief {
  const changed = existing.summary !== incoming.summary || existing.what_they_do !== incoming.what_they_do;
  return { ...existing, summary: incoming.summary, what_they_do: incoming.what_they_do, edited: existing.edited || changed };
}

// A deleted question must not leave a stale id behind in the schedule
// (RULES.md's own validator would reject that). Any day that loses a
// question gets its minutes/focus recomputed from what's left, reusing the
// exact same deterministic helpers Phase 7's scheduler uses — never
// reimplemented here. Days untouched by a deletion are left exactly as-is.
function reconcileSchedule(schedule: Schedule, questions: Question[]): Schedule {
  const questionById = new Map(questions.map((question) => [question.id, question]));

  const days = schedule.days.map((day) => {
    const remainingIds = day.question_ids.filter((id) => questionById.has(id));
    if (remainingIds.length === day.question_ids.length) {
      return day;
    }

    const remainingQuestions = remainingIds.map((id) => questionById.get(id)!);
    return {
      ...day,
      question_ids: remainingIds,
      minutes: remainingQuestions.reduce((sum, question) => sum + minutesForDifficulty(question.difficulty), 0),
      focus: buildFocus(remainingQuestions),
    };
  });

  return { ...schedule, days };
}

// Applies a builder PATCH to a loaded kit and returns the fully validated
// result — the caller persists it (kitService.saveGeneratedDraft, reused
// as-is: an edit is not a new generation pass, but the fields it touches
// are identical). Coverage and schedule are only recomputed when the
// question set actually changed; editing just the company brief, for
// instance, never re-runs coverage.
export function buildUpdatedDraftKit(kit: KitDocument, patch: UpdateKitRequest): DraftKit {
  const current = kit.toObject() as unknown as DraftKit;

  const companyBrief = patch.company_brief
    ? reconcileCompanyBrief(current.company_brief, patch.company_brief)
    : current.company_brief;

  const questions = patch.questions ? reconcileQuestions(current.questions, patch.questions) : current.questions;

  const flashcards = patch.flashcards ? reconcileFlashcards(current.flashcards, patch.flashcards) : current.flashcards;

  const coverage = patch.questions
    ? {
        uncovered_requirement_ids: checkCoverage({ role: current.role, questions }).uncovered_requirement_ids,
        passes: current.coverage.passes,
      }
    : current.coverage;

  const schedule = patch.questions ? reconcileSchedule(current.schedule, questions) : current.schedule;

  const draft: DraftKit = {
    source: current.source,
    company_brief: companyBrief,
    role: current.role,
    questions,
    flashcards,
    schedule,
    coverage,
  };

  return validateDraftKit(draft);
}
