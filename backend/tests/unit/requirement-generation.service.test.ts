import { describe, expect, it, vi } from "vitest";

const { generateValidated } = vi.hoisted(() => ({ generateValidated: vi.fn() }));
vi.mock("../../src/services/ai/gemini.client", () => ({ generateValidated }));

import { extractRequirements } from "../../src/services/generation/requirement-generation.service";

describe("extractRequirements", () => {
  it("assigns stable sequential ids and preserves must/nice priority as extracted", async () => {
    generateValidated.mockResolvedValueOnce({
      requirements: [
        { text: "5+ years with React", kind: "technical", priority: "must" },
        { text: "Experience with GraphQL", kind: "technical", priority: "nice" },
      ],
    });

    const result = await extractRequirements("some JD");

    expect(result).toEqual([
      { id: "r1", text: "5+ years with React", kind: "technical", priority: "must" },
      { id: "r2", text: "Experience with GraphQL", kind: "technical", priority: "nice" },
    ]);
  });

  it("deduplicates requirements with equivalent text", async () => {
    generateValidated.mockResolvedValueOnce({
      requirements: [
        { text: "React experience", kind: "technical", priority: "must" },
        { text: "  react   experience ", kind: "technical", priority: "must" },
      ],
    });

    const result = await extractRequirements("JD");

    expect(result).toHaveLength(1);
  });

  it("never produces duplicate ids", async () => {
    generateValidated.mockResolvedValueOnce({
      requirements: [
        { text: "A", kind: "technical", priority: "must" },
        { text: "B", kind: "technical", priority: "must" },
        { text: "C", kind: "technical", priority: "nice" },
      ],
    });

    const result = await extractRequirements("JD");
    const ids = result.map((r) => r.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("returns a thin result for a thin job description instead of inventing requirements", async () => {
    generateValidated.mockResolvedValueOnce({ requirements: [] });

    const result = await extractRequirements("Looking for a software developer. Good programming skills required.");

    expect(result).toEqual([]);
  });
});
