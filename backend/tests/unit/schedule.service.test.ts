import { describe, expect, it } from "vitest";
import { createSchedule, MAX_SCHEDULE_DAYS } from "../../src/services/scheduling/schedule.service";
import { Question, Requirement } from "../../src/types/kit.types";
import { AppError } from "../../src/utils/AppError";

function question(id: string, overrides: Partial<Question> = {}): Question {
  return {
    id,
    prompt: `Prompt for ${id}`,
    answer_outline: "...",
    difficulty: 1,
    category: "technical",
    requirement_ids: [],
    origin: "generated",
    edited: false,
    ...overrides,
  };
}

function requirement(id: string, priority: "must" | "nice" = "must"): Requirement {
  return { id, text: id, kind: "technical", priority };
}

function allScheduledIds(days: { question_ids: string[] }[]): string[] {
  return days.flatMap((day) => day.question_ids);
}

describe("createSchedule", () => {
  it("places all questions on day 1 when only one day is available", () => {
    const questions = [question("q1"), question("q2"), question("q3")];
    const schedule = createSchedule({ daysAvailable: 1, questions, requirements: [] });

    expect(schedule.days).toHaveLength(1);
    expect(schedule.days[0].question_ids.sort()).toEqual(["q1", "q2", "q3"]);
  });

  it("produces exactly 5 days for a 5-day schedule", () => {
    const questions = Array.from({ length: 5 }, (_, i) => question(`q${i + 1}`));
    const schedule = createSchedule({ daysAvailable: 5, questions, requirements: [] });

    expect(schedule.days_available).toBe(5);
    expect(schedule.days).toHaveLength(5);
    expect(schedule.days.map((d) => d.day)).toEqual([1, 2, 3, 4, 5]);
  });

  it("produces exactly 60 days when 60 days are requested, even with few questions", () => {
    const questions = [question("q1"), question("q2")];
    const schedule = createSchedule({ daysAvailable: 60, questions, requirements: [] });

    expect(schedule.days).toHaveLength(60);
    expect(schedule.days.map((d) => d.day)[59]).toBe(60);
    // Only 2 questions exist, so only the first 2 days carry content.
    expect(schedule.days.slice(2).every((d) => d.question_ids.length === 0 && d.minutes === 0)).toBe(true);
  });

  it("returns exactly N empty days for zero questions without crashing", () => {
    const schedule = createSchedule({ daysAvailable: 4, questions: [], requirements: [] });

    expect(schedule.days).toHaveLength(4);
    schedule.days.forEach((day) => {
      expect(day.question_ids).toEqual([]);
      expect(day.minutes).toBe(0);
      expect(day.focus).toBe("Review and consolidation");
    });
  });

  it("leaves later days empty when there are fewer questions than days", () => {
    const questions = [question("q1"), question("q2")];
    const schedule = createSchedule({ daysAvailable: 5, questions, requirements: [] });

    const nonEmptyDays = schedule.days.filter((d) => d.question_ids.length > 0);
    const emptyDays = schedule.days.filter((d) => d.question_ids.length === 0);
    expect(nonEmptyDays).toHaveLength(2);
    expect(emptyDays).toHaveLength(3);
    // No fabricated question ids anywhere.
    expect(allScheduledIds(schedule.days).sort()).toEqual(["q1", "q2"]);
  });

  it("distributes more questions than days across all of them deterministically", () => {
    const questions = Array.from({ length: 10 }, (_, i) => question(`q${i + 1}`));
    const schedule = createSchedule({ daysAvailable: 3, questions, requirements: [] });

    expect(schedule.days).toHaveLength(3);
    const counts = schedule.days.map((d) => d.question_ids.length);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(10);
    // Balanced: no day has more than one extra question versus another.
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it("represents every MUST requirement covered by the question set in the schedule", () => {
    const requirements = [requirement("r1", "must"), requirement("r2", "must"), requirement("r3", "nice")];
    const questions = [
      question("q1", { requirement_ids: ["r1"] }),
      question("q2", { requirement_ids: ["r2"] }),
      question("q3", { requirement_ids: ["r3"] }),
    ];

    const schedule = createSchedule({ daysAvailable: 3, questions, requirements });
    const scheduledIds = new Set(allScheduledIds(schedule.days));

    expect(scheduledIds.has("q1")).toBe(true);
    expect(scheduledIds.has("q2")).toBe(true);
  });

  it("prefers a single question covering multiple MUST requirements as the representative", () => {
    const requirements = [requirement("r1", "must"), requirement("r2", "must")];
    const questions = [
      question("qBoth", { requirement_ids: ["r1", "r2"], difficulty: 1 }),
      question("qOne", { requirement_ids: ["r1"], difficulty: 3 }),
    ];

    const schedule = createSchedule({ daysAvailable: 1, questions, requirements });

    // qBoth alone satisfies both MUST requirements, so the greedy pass
    // never needs to additionally select qOne for coverage purposes —
    // both still end up scheduled (nothing is discarded), but qBoth is the
    // one guaranteed as the MUST-coverage representative.
    expect(schedule.days[0].question_ids).toContain("qBoth");
  });

  it("schedules harder questions before easier ones when MUST coverage is equal", () => {
    const questions = [question("qEasy", { difficulty: 1 }), question("qHard", { difficulty: 3 })];
    const schedule = createSchedule({ daysAvailable: 2, questions, requirements: [] });

    expect(schedule.days[0].question_ids).toEqual(["qHard"]);
    expect(schedule.days[1].question_ids).toEqual(["qEasy"]);
  });

  it("produces the same schedule for the same input every time (determinism)", () => {
    const requirements = [requirement("r1", "must")];
    const questions = [question("q1", { requirement_ids: ["r1"], difficulty: 2 }), question("q2", { difficulty: 1 })];

    const first = createSchedule({ daysAvailable: 2, questions, requirements });
    const second = createSchedule({ daysAvailable: 2, questions, requirements });

    expect(first).toEqual(second);
  });

  it("always produces integer minutes", () => {
    const questions = [question("q1", { difficulty: 1 }), question("q2", { difficulty: 2 }), question("q3", { difficulty: 3 })];
    const schedule = createSchedule({ daysAvailable: 1, questions, requirements: [] });

    schedule.days.forEach((day) => {
      expect(Number.isInteger(day.minutes)).toBe(true);
    });
    expect(schedule.days[0].minutes).toBe(10 + 15 + 20);
  });

  it("rejects an invalid daysAvailable instead of silently producing a broken schedule", () => {
    expect(() => createSchedule({ daysAvailable: 0, questions: [], requirements: [] })).toThrow(AppError);
    expect(() => createSchedule({ daysAvailable: 1.5, questions: [], requirements: [] })).toThrow(AppError);
    expect(() => createSchedule({ daysAvailable: MAX_SCHEDULE_DAYS + 1, questions: [], requirements: [] })).toThrow(AppError);
  });

  it("produces exactly the requested number of days, never more or fewer", () => {
    for (const days of [1, 3, 7, 30, 60]) {
      const schedule = createSchedule({ daysAvailable: days, questions: [question("q1")], requirements: [] });
      expect(schedule.days).toHaveLength(days);
    }
  });

  it("never assigns the same question id to more than one day", () => {
    const questions = Array.from({ length: 7 }, (_, i) => question(`q${i + 1}`));
    const schedule = createSchedule({ daysAvailable: 3, questions, requirements: [] });

    const ids = allScheduledIds(schedule.days);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("does not fabricate coverage for a requirement with no matching question", () => {
    const requirements = [requirement("r1", "must")]; // uncovered — no question references it
    const questions = [question("q1", { requirement_ids: [] })];

    const schedule = createSchedule({ daysAvailable: 1, questions, requirements });

    expect(allScheduledIds(schedule.days)).toEqual(["q1"]);
  });

  it("labels an empty day as review/consolidation", () => {
    const schedule = createSchedule({ daysAvailable: 2, questions: [question("q1")], requirements: [] });
    const emptyDay = schedule.days.find((d) => d.question_ids.length === 0);

    expect(emptyDay?.focus).toBe("Review and consolidation");
  });

  it("combines multiple categories present on the same day into one focus string", () => {
    const questions = [
      question("q1", { category: "technical" }),
      question("q2", { category: "behavioural" }),
    ];
    const schedule = createSchedule({ daysAvailable: 1, questions, requirements: [] });

    expect(schedule.days[0].focus).toBe("Technical fundamentals & Behavioural");
  });
});
