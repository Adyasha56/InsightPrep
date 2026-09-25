import { describe, expect, it, vi } from "vitest";

const { generateValidated } = vi.hoisted(() => ({ generateValidated: vi.fn() }));
vi.mock("../../src/services/ai/gemini.client", () => ({ generateValidated }));

import { generateMissingQuestions } from "../../src/services/generation/missing-question-generation.service";
import { buildMissingQuestionResponseSchema } from "../../src/services/ai/prompts/missing-question-generation.prompt";
import { Requirement } from "../../src/types/kit.types";

const context = { role: { title: "Engineer", seniority: "Senior", responsibilities: [] }, companyContext: "" };

describe("generateMissingQuestions", () => {
  it("returns an empty array and skips Gemini when there is nothing uncovered", async () => {
    const result = await generateMissingQuestions([], context);

    expect(result).toEqual([]);
    expect(generateValidated).not.toHaveBeenCalled();
  });

  it("generates a question covering the supplied uncovered requirement", async () => {
    const requirement: Requirement = { id: "r3", text: "PostgreSQL", kind: "technical", priority: "must" };
    generateValidated.mockResolvedValueOnce({
      questions: [
        { prompt: "Explain indexing in PostgreSQL.", answer_outline: "...", difficulty: 2, category: "technical", requirement_ids: ["r3"] },
      ],
    });

    const result = await generateMissingQuestions([requirement], context);

    expect(result).toHaveLength(1);
    expect(result[0].requirement_ids).toEqual(["r3"]);
  });
});

describe("buildMissingQuestionResponseSchema", () => {
  it("rejects a response that leaves a required requirement id uncovered", () => {
    const schema = buildMissingQuestionResponseSchema(["r3", "r5"]);

    const result = schema.safeParse({
      questions: [{ prompt: "Q", answer_outline: "A", difficulty: 1, category: "technical", requirement_ids: ["r3"] }],
    });

    expect(result.success).toBe(false);
  });

  it("rejects a question referencing an id outside the uncovered set", () => {
    const schema = buildMissingQuestionResponseSchema(["r3"]);

    const result = schema.safeParse({
      questions: [{ prompt: "Q", answer_outline: "A", difficulty: 1, category: "technical", requirement_ids: ["r99"] }],
    });

    expect(result.success).toBe(false);
  });

  it("accepts a response that covers every required id", () => {
    const schema = buildMissingQuestionResponseSchema(["r3", "r5"]);

    const result = schema.safeParse({
      questions: [
        { prompt: "Q1", answer_outline: "A", difficulty: 1, category: "technical", requirement_ids: ["r3"] },
        { prompt: "Q2", answer_outline: "A", difficulty: 2, category: "behavioural", requirement_ids: ["r5"] },
      ],
    });

    expect(result.success).toBe(true);
  });
});
