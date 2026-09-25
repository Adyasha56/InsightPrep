import { describe, expect, it, vi } from "vitest";

const { generateValidated } = vi.hoisted(() => ({ generateValidated: vi.fn() }));
vi.mock("../../src/services/ai/gemini.client", () => ({ generateValidated }));

import {
  generateBehaviouralQuestions,
  generateCompanyFitQuestions,
  generateSystemDesignQuestions,
  generateTechnicalQuestions,
} from "../../src/services/generation/question-generation.service";
import { buildQuestionResponseSchema } from "../../src/services/ai/prompts/question-generation.prompt";
import { Requirement } from "../../src/types/kit.types";

const technicalRequirement: Requirement = { id: "r1", text: "5+ years with React", kind: "technical", priority: "must" };
const behaviouralRequirement: Requirement = { id: "r2", text: "Mentors junior engineers", kind: "behavioural", priority: "must" };

function baseContext(requirements: Requirement[]) {
  return {
    jobDescription: "JD",
    requirements,
    role: { title: "Engineer", seniority: "Senior", responsibilities: ["Lead projects"] },
    companyContext: "",
  };
}

describe("category-specific question generation", () => {
  it("skips the Gemini call and returns no technical questions when there are no technical requirements", async () => {
    const result = await generateTechnicalQuestions(baseContext([behaviouralRequirement]));

    expect(result).toEqual([]);
    expect(generateValidated).not.toHaveBeenCalled();
  });

  it("skips the Gemini call and returns no behavioural questions when there are no behavioural requirements", async () => {
    const result = await generateBehaviouralQuestions(baseContext([technicalRequirement]));

    expect(result).toEqual([]);
    expect(generateValidated).not.toHaveBeenCalled();
  });

  it("generates technical questions that reference a valid technical requirement id", async () => {
    generateValidated.mockResolvedValueOnce({
      questions: [
        { prompt: "Explain React reconciliation.", answer_outline: "...", difficulty: 2, requirement_ids: ["r1"] },
      ],
    });

    const result = await generateTechnicalQuestions(baseContext([technicalRequirement]));

    expect(result).toHaveLength(1);
    expect(result[0].requirement_ids).toEqual(["r1"]);
    expect(result[0].category).toBe("technical");
  });

  it("generates behavioural questions that reference a valid behavioural requirement id", async () => {
    generateValidated.mockResolvedValueOnce({
      questions: [
        { prompt: "Tell me about mentoring.", answer_outline: "...", difficulty: 1, requirement_ids: ["r2"] },
      ],
    });

    const result = await generateBehaviouralQuestions(baseContext([behaviouralRequirement]));

    expect(result[0].requirement_ids).toEqual(["r2"]);
  });

  it("allows system-design questions to legitimately be an empty array", async () => {
    generateValidated.mockResolvedValueOnce({ questions: [] });

    const result = await generateSystemDesignQuestions(baseContext([technicalRequirement]));

    expect(result).toEqual([]);
  });

  it("produces structurally valid company-fit questions", async () => {
    generateValidated.mockResolvedValueOnce({
      questions: [
        { prompt: "Why this company?", answer_outline: "...", difficulty: 1, requirement_ids: [] },
      ],
    });

    const result = await generateCompanyFitQuestions(baseContext([technicalRequirement]));

    expect(result[0].category).toBe("company-fit");
    expect(result[0].difficulty).toBe(1);
  });
});

describe("buildQuestionResponseSchema", () => {
  it("rejects a question that references a requirement id outside the allowed set", () => {
    const schema = buildQuestionResponseSchema(["r1"]);

    const result = schema.safeParse({
      questions: [{ prompt: "Q", answer_outline: "A", difficulty: 1, requirement_ids: ["r99"] }],
    });

    expect(result.success).toBe(false);
  });

  it("restricts difficulty to exactly 1, 2, or 3", () => {
    const schema = buildQuestionResponseSchema(["r1"]);

    const invalid = schema.safeParse({
      questions: [{ prompt: "Q", answer_outline: "A", difficulty: 4, requirement_ids: [] }],
    });
    const valid = schema.safeParse({
      questions: [{ prompt: "Q", answer_outline: "A", difficulty: 3, requirement_ids: [] }],
    });

    expect(invalid.success).toBe(false);
    expect(valid.success).toBe(true);
  });
});
