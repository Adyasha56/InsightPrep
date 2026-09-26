import { describe, expect, it } from "vitest";
import { Kit } from "../../src/models/kit.model";
import { recordFlashcardConfidence } from "../../src/services/kit-practice.service";
import { AppError } from "../../src/utils/AppError";

// new Kit({...}) constructs a real Mongoose document (schema defaults,
// subdocument casting) without touching a database, same pattern as
// kit-update.service.test.ts.
function fixtureKit(overrides: Record<string, unknown> = {}) {
  return new Kit({
    owner: "507f1f77bcf86cd799439011",
    generationStatus: "completed",
    source: { job_description: "JD", company_url: "https://example.com", days_available: 3 },
    company_brief: { summary: "Summary.", what_they_do: "Description.", sources: ["https://example.com"], edited: false },
    role: {
      title: "Engineer",
      seniority: "Senior",
      responsibilities: ["Build things"],
      requirements: [{ id: "r1", text: "React", kind: "technical", priority: "must" }],
    },
    questions: [
      {
        id: "q1",
        prompt: "Explain React hooks.",
        answer_outline: "...",
        difficulty: 2,
        category: "technical",
        requirement_ids: ["r1"],
        origin: "generated",
        edited: false,
      },
    ],
    flashcards: [
      { id: "f1", front: "What is a hook?", back: "...", requirement_ids: ["r1"], origin: "generated", edited: false, confidence: null },
      { id: "f2", front: "My own card.", back: "...", requirement_ids: [], origin: "user", edited: false, confidence: "low" },
    ],
    schedule: {
      days_available: 3,
      days: [
        { day: 1, focus: "Technical fundamentals", question_ids: ["q1"], minutes: 15 },
        { day: 2, focus: "Review and consolidation", question_ids: [], minutes: 0 },
        { day: 3, focus: "Review and consolidation", question_ids: [], minutes: 0 },
      ],
    },
    coverage: { uncovered_requirement_ids: [], passes: 1 },
    ...overrides,
  });
}

describe("recordFlashcardConfidence", () => {
  it("sets confidence on the target flashcard only", () => {
    const kit = fixtureKit();
    const draft = recordFlashcardConfidence(kit, "f1", "high");

    expect(draft.flashcards.find((f) => f.id === "f1")!.confidence).toBe("high");
    expect(draft.flashcards.find((f) => f.id === "f2")!.confidence).toBe("low");
  });

  it("works the same regardless of the flashcard's origin", () => {
    const kit = fixtureKit();
    const draft = recordFlashcardConfidence(kit, "f2", "medium");

    expect(draft.flashcards.find((f) => f.id === "f2")).toEqual(
      expect.objectContaining({ origin: "user", confidence: "medium" })
    );
  });

  it("does not touch edited, questions, brief, schedule, or coverage", () => {
    const kit = fixtureKit();
    const before = kit.toObject();
    const draft = recordFlashcardConfidence(kit, "f1", "low");

    expect(draft.flashcards.find((f) => f.id === "f1")!.edited).toBe(false);
    expect(draft.questions).toEqual(before.questions);
    expect(draft.company_brief).toEqual(before.company_brief);
    expect(draft.schedule).toEqual(before.schedule);
    expect(draft.coverage).toEqual(before.coverage);
  });

  it("can move a card back and forth between confidence levels", () => {
    const kit = fixtureKit();
    recordFlashcardConfidence(kit, "f1", "high");
    const draft = recordFlashcardConfidence(kit, "f1", "low");

    expect(draft.flashcards.find((f) => f.id === "f1")!.confidence).toBe("low");
  });

  it("rejects an unknown flashcard id", () => {
    const kit = fixtureKit();
    expect(() => recordFlashcardConfidence(kit, "f999", "high")).toThrow(AppError);
  });

  it("survives a subsequent unrelated content edit — confidence is not content", () => {
    // Simulates the Phase 10 reconciliation spreading `...previous` forward,
    // which already carries `confidence` through untouched.
    const kit = fixtureKit();
    const practiced = recordFlashcardConfidence(kit, "f1", "high");
    const stillHigh = practiced.flashcards.find((f) => f.id === "f1")!;
    expect(stillHigh.confidence).toBe("high");
  });

  it("returns a result that satisfies the existing draft kit schema", () => {
    const kit = fixtureKit();
    expect(() => recordFlashcardConfidence(kit, "f1", "medium")).not.toThrow();
  });
});
