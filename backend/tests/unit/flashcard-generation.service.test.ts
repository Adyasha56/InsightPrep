import { describe, expect, it, vi } from "vitest";

const { generateValidated } = vi.hoisted(() => ({ generateValidated: vi.fn() }));
vi.mock("../../src/services/ai/gemini.client", () => ({ generateValidated }));

import { generateFlashcards } from "../../src/services/generation/flashcard-generation.service";
import { buildFlashcardResponseSchema } from "../../src/services/ai/prompts/flashcard-generation.prompt";
import { Requirement } from "../../src/types/kit.types";

describe("generateFlashcards", () => {
  it("returns no flashcards and skips Gemini when there is nothing to reinforce", async () => {
    const result = await generateFlashcards([], []);

    expect(result).toEqual([]);
    expect(generateValidated).not.toHaveBeenCalled();
  });

  it("passes through flashcards that reference valid requirement ids", async () => {
    const requirements: Requirement[] = [{ id: "r1", text: "React", kind: "technical", priority: "must" }];
    generateValidated.mockResolvedValueOnce({
      flashcards: [{ front: "What is reconciliation?", back: "...", requirement_ids: ["r1"] }],
    });

    const result = await generateFlashcards(requirements, []);

    expect(result).toEqual([{ front: "What is reconciliation?", back: "...", requirement_ids: ["r1"] }]);
  });
});

describe("buildFlashcardResponseSchema", () => {
  it("rejects a flashcard referencing an unknown requirement id", () => {
    const schema = buildFlashcardResponseSchema(["r1"]);

    const result = schema.safeParse({
      flashcards: [{ front: "Q", back: "A", requirement_ids: ["r99"] }],
    });

    expect(result.success).toBe(false);
  });
});
