import { describe, expect, it } from "vitest";
import {
  buildFocus,
  compareQuestionIdsNumerically,
  minutesForDifficulty,
  scoreQuestion,
  sortByScoreDescending,
} from "../../src/services/scheduling/schedule.utils";
import { Question, Requirement } from "../../src/types/kit.types";

function question(id: string, overrides: Partial<Question> = {}): Question {
  return {
    id,
    prompt: "?",
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

describe("minutesForDifficulty", () => {
  it("maps each difficulty to an integer minute budget", () => {
    expect(minutesForDifficulty(1)).toBe(10);
    expect(minutesForDifficulty(2)).toBe(15);
    expect(minutesForDifficulty(3)).toBe(20);
  });
});

describe("scoreQuestion", () => {
  it("weighs MUST coverage above difficulty", () => {
    const requirementsById = new Map([
      ["r1", requirement("r1", "must")],
      ["r2", requirement("r2", "nice")],
    ]);

    const mustQuestion = question("q1", { difficulty: 1, requirement_ids: ["r1"] });
    const hardNiceQuestion = question("q2", { difficulty: 3, requirement_ids: ["r2"] });

    expect(scoreQuestion(mustQuestion, requirementsById)).toBeGreaterThan(scoreQuestion(hardNiceQuestion, requirementsById));
  });

  it("weighs difficulty above the requirement-count tiebreaker", () => {
    const requirementsById = new Map([
      ["r1", requirement("r1", "nice")],
      ["r2", requirement("r2", "nice")],
      ["r3", requirement("r3", "nice")],
    ]);

    const easyBroad = question("q1", { difficulty: 1, requirement_ids: ["r1", "r2", "r3"] });
    const hardNarrow = question("q2", { difficulty: 3, requirement_ids: ["r1"] });

    expect(scoreQuestion(hardNarrow, requirementsById)).toBeGreaterThan(scoreQuestion(easyBroad, requirementsById));
  });

  it("does not double-count a duplicate requirement id within the same question", () => {
    const requirementsById = new Map([["r1", requirement("r1", "must")]]);
    const q = question("q1", { requirement_ids: ["r1", "r1", "r1"] });

    expect(scoreQuestion(q, requirementsById)).toBe(scoreQuestion(question("q2", { requirement_ids: ["r1"] }), requirementsById));
  });
});

describe("compareQuestionIdsNumerically", () => {
  it("orders by numeric suffix, not lexicographically", () => {
    expect(compareQuestionIdsNumerically("q2", "q10")).toBeLessThan(0);
    expect(["q10", "q2", "q1"].sort(compareQuestionIdsNumerically)).toEqual(["q1", "q2", "q10"]);
  });
});

describe("sortByScoreDescending", () => {
  it("is a stable, deterministic sort using id as a tiebreaker", () => {
    const scored = [
      { question: question("q2"), score: 5 },
      { question: question("q1"), score: 5 },
      { question: question("q3"), score: 9 },
    ];

    const result = sortByScoreDescending(scored);
    expect(result.map((r) => r.question.id)).toEqual(["q3", "q1", "q2"]);
  });

  it("produces the same result across repeated calls (determinism)", () => {
    const scored = [
      { question: question("q5"), score: 3 },
      { question: question("q4"), score: 3 },
      { question: question("q1"), score: 8 },
    ];

    const first = sortByScoreDescending(scored).map((r) => r.question.id);
    const second = sortByScoreDescending(scored).map((r) => r.question.id);
    expect(first).toEqual(second);
  });
});

describe("buildFocus", () => {
  it("returns an honest consolidation label for an empty day", () => {
    expect(buildFocus([])).toBe("Review and consolidation");
  });

  it("names a single category", () => {
    expect(buildFocus([question("q1", { category: "system-design" })])).toBe("System design and architecture");
  });

  it("combines mixed categories in a fixed, deterministic order", () => {
    const day = [question("q1", { category: "company-fit" }), question("q2", { category: "technical" })];
    expect(buildFocus(day)).toBe("Technical fundamentals & Company fit");
  });
});
