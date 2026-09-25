import { describe, expect, it } from "vitest";
import { checkCoverage } from "../../src/services/validation/coverage.service";
import { Question, Requirement } from "../../src/types/kit.types";

function requirement(id: string, priority: "must" | "nice", kind: Requirement["kind"] = "technical"): Requirement {
  return { id, text: `Requirement ${id}`, kind, priority };
}

function question(id: string, requirementIds: string[]): Question {
  return { id, prompt: "?", answer_outline: "...", difficulty: 1, category: "technical", requirement_ids: requirementIds };
}

describe("checkCoverage", () => {
  it("reports complete coverage when every requirement is referenced", () => {
    const result = checkCoverage({
      role: { requirements: [requirement("r1", "must"), requirement("r2", "must")] },
      questions: [question("q1", ["r1"]), question("q2", ["r2"])],
    });

    expect(result.uncovered_requirement_ids).toEqual([]);
    expect(result.coverage_complete).toBe(true);
  });

  it("identifies a single uncovered requirement", () => {
    const result = checkCoverage({
      role: { requirements: [requirement("r1", "must"), requirement("r2", "must"), requirement("r3", "must")] },
      questions: [question("q1", ["r1"]), question("q2", ["r2"]), question("q3", ["r1"])],
    });

    expect(result.uncovered_requirement_ids).toEqual(["r3"]);
  });

  it("identifies multiple uncovered requirements", () => {
    const result = checkCoverage({
      role: { requirements: [requirement("r1", "must"), requirement("r2", "must"), requirement("r3", "must")] },
      questions: [question("q1", ["r1"])],
    });

    expect(result.uncovered_requirement_ids).toEqual(["r2", "r3"]);
  });

  it("is incomplete when only a MUST requirement is uncovered", () => {
    const result = checkCoverage({
      role: { requirements: [requirement("r1", "must"), requirement("r2", "nice")] },
      questions: [question("q1", ["r2"])],
    });

    expect(result.uncovered_must_requirement_ids).toEqual(["r1"]);
    expect(result.coverage_complete).toBe(false);
  });

  it("does not block completion on an uncovered NICE requirement", () => {
    const result = checkCoverage({
      role: { requirements: [requirement("r1", "must"), requirement("r2", "nice")] },
      questions: [question("q1", ["r1"])],
    });

    expect(result.uncovered_must_requirement_ids).toEqual([]);
    expect(result.uncovered_nice_requirement_ids).toEqual(["r2"]);
    expect(result.coverage_complete).toBe(true);
  });

  it("treats a question referencing multiple requirements as covering all of them", () => {
    const result = checkCoverage({
      role: { requirements: [requirement("r1", "must"), requirement("r2", "must")] },
      questions: [question("q1", ["r1", "r2"])],
    });

    expect(result.covered_requirement_ids).toEqual(["r1", "r2"]);
  });

  it("is unaffected by duplicate question ids referencing the same requirement", () => {
    const result = checkCoverage({
      role: { requirements: [requirement("r1", "must")] },
      questions: [question("q1", ["r1"]), question("q1", ["r1"])],
    });

    expect(result.uncovered_requirement_ids).toEqual([]);
    expect(result.covered_requirement_ids).toEqual(["r1"]);
  });

  it("never inspects question prompt/answer text to infer coverage", () => {
    const result = checkCoverage({
      role: { requirements: [requirement("r1", "must")] },
      questions: [{ id: "q1", prompt: "Talk about r1", answer_outline: "r1 details", difficulty: 1, category: "technical", requirement_ids: [] }],
    });

    expect(result.uncovered_requirement_ids).toEqual(["r1"]);
  });
});
