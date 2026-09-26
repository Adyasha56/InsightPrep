import { describe, expect, it } from "vitest";
import { validateDraftKit } from "../../src/validators/kit.validator";
import { DraftKit } from "../../src/types/kit.types";
import { AppError } from "../../src/utils/AppError";

function validDraftKit(): DraftKit {
  return {
    source: { job_description: "JD text", company_url: "https://example.com", days_available: 5 },
    company_brief: {
      summary: "A company.",
      what_they_do: "Builds things.",
      sources: ["https://example.com"],
      edited: false,
    },
    role: {
      title: "Backend Engineer",
      seniority: "Senior",
      responsibilities: ["Build APIs"],
      requirements: [{ id: "r1", text: "5+ years with Node.js", kind: "technical", priority: "must" }],
    },
    questions: [
      {
        id: "q1",
        prompt: "Explain event loop.",
        answer_outline: "...",
        difficulty: 2,
        category: "technical",
        requirement_ids: ["r1"],
        origin: "generated",
        edited: false,
      },
    ],
    flashcards: [
      { id: "f1", front: "Event loop?", back: "...", requirement_ids: ["r1"], origin: "generated", edited: false, confidence: null },
    ],
    schedule: {
      days_available: 5,
      days: [
        { day: 1, focus: "Technical fundamentals", question_ids: ["q1"], minutes: 15 },
        { day: 2, focus: "Review and consolidation", question_ids: [], minutes: 0 },
        { day: 3, focus: "Review and consolidation", question_ids: [], minutes: 0 },
        { day: 4, focus: "Review and consolidation", question_ids: [], minutes: 0 },
        { day: 5, focus: "Review and consolidation", question_ids: [], minutes: 0 },
      ],
    },
    coverage: { uncovered_requirement_ids: [], passes: 1 },
  };
}

describe("validateDraftKit", () => {
  it("accepts a well-formed draft kit", () => {
    expect(() => validateDraftKit(validDraftKit())).not.toThrow();
  });

  it("rejects a question with a difficulty outside 1-3", () => {
    const kit = validDraftKit();
    kit.questions[0].difficulty = 4 as never;

    expect(() => validateDraftKit(kit)).toThrow(AppError);
  });

  it("rejects a question that references a requirement id that doesn't exist", () => {
    const kit = validDraftKit();
    kit.questions[0].requirement_ids = ["r99"];

    expect(() => validateDraftKit(kit)).toThrow(AppError);
  });

  it("rejects a flashcard that references a requirement id that doesn't exist", () => {
    const kit = validDraftKit();
    kit.flashcards[0].requirement_ids = ["r99"];

    expect(() => validateDraftKit(kit)).toThrow(AppError);
  });

  it("rejects duplicate question ids", () => {
    const kit = validDraftKit();
    kit.questions.push({ ...kit.questions[0] });

    expect(() => validateDraftKit(kit)).toThrow(AppError);
  });

  it("rejects an invalid question category", () => {
    const kit = validDraftKit();
    kit.questions[0].category = "trivia" as never;

    expect(() => validateDraftKit(kit)).toThrow(AppError);
  });

  it("rejects a missing top-level field", () => {
    const kit = validDraftKit() as unknown as Record<string, unknown>;
    delete kit.schedule;

    expect(() => validateDraftKit(kit)).toThrow(AppError);
  });

  it("rejects a schedule with the wrong number of days", () => {
    const kit = validDraftKit();
    kit.schedule.days.pop();

    expect(() => validateDraftKit(kit)).toThrow(AppError);
  });

  it("rejects a schedule day referencing a question id that doesn't exist", () => {
    const kit = validDraftKit();
    kit.schedule.days[0].question_ids = ["q99"];

    expect(() => validateDraftKit(kit)).toThrow(AppError);
  });

  it("rejects a question scheduled on more than one day", () => {
    const kit = validDraftKit();
    kit.schedule.days[1].question_ids = ["q1"];

    expect(() => validateDraftKit(kit)).toThrow(AppError);
  });

  it("rejects a MUST requirement that is covered by a question but absent from the schedule", () => {
    const kit = validDraftKit();
    kit.schedule.days[0].question_ids = [];

    expect(() => validateDraftKit(kit)).toThrow(AppError);
  });

  it("does not reject a MUST requirement that has no covering question at all", () => {
    const kit = validDraftKit();
    kit.role.requirements.push({ id: "r2", text: "Docker", kind: "technical", priority: "must" });
    kit.coverage.uncovered_requirement_ids = ["r2"];

    expect(() => validateDraftKit(kit)).not.toThrow();
  });
});
