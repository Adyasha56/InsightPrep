import { beforeEach, describe, expect, it, vi } from "vitest";

const { generateValidated } = vi.hoisted(() => ({ generateValidated: vi.fn() }));
vi.mock("../../src/services/ai/gemini.client", () => ({ generateValidated }));

const { researchCompany } = vi.hoisted(() => ({ researchCompany: vi.fn() }));
vi.mock("../../src/services/research/company-research.service", () => ({ researchCompany }));

import { Kit } from "../../src/models/kit.model";
import { buildRegeneratedDraftKit } from "../../src/services/generation/kit-regeneration.service";

// new Kit({...}) constructs a real Mongoose document (schema defaults,
// subdocument casting) without touching a database, same pattern as
// kit-update.service.test.ts.
function fixtureKit(overrides: Record<string, unknown> = {}) {
  return new Kit({
    owner: "507f1f77bcf86cd799439011",
    generationStatus: "completed",
    source: { job_description: "JD", company_url: "https://example.com", days_available: 3 },
    company_brief: { summary: "Old summary.", what_they_do: "Old description.", sources: ["https://example.com"], edited: false },
    role: {
      title: "Engineer",
      seniority: "Senior",
      responsibilities: ["Build things"],
      requirements: [
        { id: "r1", text: "React", kind: "technical", priority: "must" },
        { id: "r2", text: "Testing", kind: "behavioural", priority: "nice" },
      ],
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
      {
        id: "q2",
        prompt: "My own technical question.",
        answer_outline: "...",
        difficulty: 2,
        category: "technical",
        requirement_ids: [],
        origin: "user",
        edited: false,
      },
      {
        id: "q3",
        prompt: "Edited technical question.",
        answer_outline: "...",
        difficulty: 3,
        category: "technical",
        requirement_ids: [],
        origin: "generated",
        edited: true,
      },
      {
        id: "q4",
        prompt: "Tell me about testing.",
        answer_outline: "...",
        difficulty: 1,
        category: "behavioural",
        requirement_ids: ["r2"],
        origin: "generated",
        edited: false,
      },
    ],
    flashcards: [
      { id: "f1", front: "What is a hook?", back: "...", requirement_ids: ["r1"], origin: "generated", edited: false },
    ],
    schedule: {
      days_available: 3,
      days: [
        { day: 1, focus: "Technical fundamentals", question_ids: ["q1", "q2", "q3"], minutes: 45 },
        { day: 2, focus: "Behavioural", question_ids: ["q4"], minutes: 10 },
        { day: 3, focus: "Review and consolidation", question_ids: [], minutes: 0 },
      ],
    },
    coverage: { uncovered_requirement_ids: [], passes: 1 },
    ...overrides,
  });
}

const baseResearch = {
  companyUrl: "https://example.com",
  finalUrl: "https://example.com",
  status: "success" as const,
  pages: [
    {
      url: "https://example.com",
      title: "Home",
      status: 200,
      contentType: "text/html",
      text: "We build things.",
      links: [],
      fetchedAt: "2024-01-01T00:00:00.000Z",
      sourceType: "homepage" as const,
    },
  ],
  pagesUsed: 1,
  companyPages: [],
  hiringPages: [],
  failures: [],
  warnings: [],
  fetchedAt: "2024-01-01T00:00:00.000Z",
};

beforeEach(() => {
  generateValidated.mockReset();
  researchCompany.mockReset();
});

describe("buildRegeneratedDraftKit — category regeneration", () => {
  it("replaces only generated+unedited questions in the target category", async () => {
    researchCompany.mockResolvedValueOnce(baseResearch);
    generateValidated.mockResolvedValueOnce({
      questions: [{ prompt: "Fresh technical question.", answer_outline: "...", difficulty: 2, requirement_ids: ["r1"] }],
    });

    const kit = fixtureKit();
    const draft = await buildRegeneratedDraftKit(kit, { target: "category", category: "technical" });

    const technicalQuestions = draft.questions.filter((q) => q.category === "technical");
    expect(technicalQuestions.some((q) => q.id === "q1")).toBe(false);
    expect(technicalQuestions.some((q) => q.id === "q2")).toBe(true);
    expect(technicalQuestions.some((q) => q.id === "q3")).toBe(true);
    expect(technicalQuestions.some((q) => q.prompt === "Fresh technical question.")).toBe(true);
  });

  it("preserves user-created, edited, and category-moved questions untouched", async () => {
    researchCompany.mockResolvedValueOnce(baseResearch);
    generateValidated.mockResolvedValueOnce({ questions: [] });

    const kit = fixtureKit();
    const draft = await buildRegeneratedDraftKit(kit, { target: "category", category: "technical" });

    const q2 = draft.questions.find((q) => q.id === "q2")!;
    const q3 = draft.questions.find((q) => q.id === "q3")!;
    expect(q2).toEqual(expect.objectContaining({ origin: "user", edited: false, prompt: "My own technical question." }));
    expect(q3).toEqual(expect.objectContaining({ origin: "generated", edited: true, prompt: "Edited technical question." }));
  });

  it("never touches other categories, flashcards, or the company brief", async () => {
    researchCompany.mockResolvedValueOnce(baseResearch);
    generateValidated.mockResolvedValueOnce({ questions: [] });

    const kit = fixtureKit();
    const before = kit.toObject();
    const draft = await buildRegeneratedDraftKit(kit, { target: "category", category: "technical" });

    expect(draft.questions.find((q) => q.id === "q4")).toEqual(before.questions.find((q) => q.id === "q4"));
    expect(draft.flashcards).toEqual(before.flashcards);
    expect(draft.company_brief).toEqual(before.company_brief);
  });

  it("mints fresh question ids that never collide with any existing id in the kit", async () => {
    researchCompany.mockResolvedValueOnce(baseResearch);
    generateValidated.mockResolvedValueOnce({
      questions: [
        { prompt: "Fresh one.", answer_outline: "...", difficulty: 1, requirement_ids: [] },
        { prompt: "Fresh two.", answer_outline: "...", difficulty: 1, requirement_ids: [] },
      ],
    });

    const kit = fixtureKit();
    const draft = await buildRegeneratedDraftKit(kit, { target: "category", category: "technical" });

    const ids = draft.questions.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("q5");
    expect(ids).toContain("q6");
  });

  it("recomputes coverage and schedule so no stale question id survives", async () => {
    researchCompany.mockResolvedValueOnce(baseResearch);
    generateValidated.mockResolvedValueOnce({ questions: [] });

    const kit = fixtureKit();
    const draft = await buildRegeneratedDraftKit(kit, { target: "category", category: "technical" });

    // q1 (dropped) was the only question covering r1.
    expect(draft.coverage.uncovered_requirement_ids).toContain("r1");
    const scheduledIds = draft.schedule.days.flatMap((day) => day.question_ids);
    expect(scheduledIds).not.toContain("q1");
    expect(new Set(scheduledIds)).toEqual(new Set(draft.questions.map((q) => q.id)));
  });

  it("builds a result that satisfies the existing draft kit schema", async () => {
    researchCompany.mockResolvedValueOnce(baseResearch);
    generateValidated.mockResolvedValueOnce({
      questions: [{ prompt: "Fresh technical question.", answer_outline: "...", difficulty: 2, requirement_ids: ["r1"] }],
    });

    const kit = fixtureKit();
    // buildRegeneratedDraftKit runs the result through validateDraftKit
    // internally — resolving without throwing is the assertion.
    await expect(buildRegeneratedDraftKit(kit, { target: "category", category: "technical" })).resolves.toBeDefined();
  });

  it("propagates a generation failure without ever persisting anything", async () => {
    researchCompany.mockResolvedValueOnce(baseResearch);
    generateValidated.mockRejectedValueOnce(new Error("Gemini exploded"));

    const kit = fixtureKit();
    await expect(buildRegeneratedDraftKit(kit, { target: "category", category: "technical" })).rejects.toThrow();
    // The in-memory document handed in is never mutated by a failed attempt.
    expect(kit.questions.map((q) => q.id)).toEqual(["q1", "q2", "q3", "q4"]);
  });
});

describe("buildRegeneratedDraftKit — company brief regeneration", () => {
  it("replaces the brief and leaves everything else untouched", async () => {
    researchCompany.mockResolvedValueOnce(baseResearch);
    generateValidated.mockResolvedValueOnce({ summary: "Fresh summary.", what_they_do: "Fresh description." });

    const kit = fixtureKit();
    const before = kit.toObject();
    const draft = await buildRegeneratedDraftKit(kit, { target: "company_brief" });

    expect(draft.company_brief.summary).toBe("Fresh summary.");
    expect(draft.company_brief.what_they_do).toBe("Fresh description.");
    expect(draft.company_brief.edited).toBe(false);
    expect(draft.company_brief.sources).toEqual(["https://example.com"]);
    expect(draft.questions).toEqual(before.questions);
    expect(draft.flashcards).toEqual(before.flashcards);
    expect(draft.schedule).toEqual(before.schedule);
  });

  it("replaces an already hand-edited brief wholesale (no per-field protection for a single brief)", async () => {
    researchCompany.mockResolvedValueOnce(baseResearch);
    generateValidated.mockResolvedValueOnce({ summary: "Fresh summary.", what_they_do: "Fresh description." });

    const kit = fixtureKit({
      company_brief: { summary: "Hand-edited.", what_they_do: "Hand-edited.", sources: ["https://example.com"], edited: true },
    });
    const draft = await buildRegeneratedDraftKit(kit, { target: "company_brief" });

    expect(draft.company_brief.summary).toBe("Fresh summary.");
    expect(draft.company_brief.edited).toBe(false);
  });
});

describe("buildRegeneratedDraftKit — schedule regeneration", () => {
  it("recomputes the schedule without calling Gemini or research, and touches nothing else", async () => {
    const kit = fixtureKit();
    const before = kit.toObject();
    const draft = await buildRegeneratedDraftKit(kit, { target: "schedule" });

    expect(generateValidated).not.toHaveBeenCalled();
    expect(researchCompany).not.toHaveBeenCalled();
    expect(draft.questions).toEqual(before.questions);
    expect(draft.flashcards).toEqual(before.flashcards);
    expect(draft.company_brief).toEqual(before.company_brief);
    expect(draft.coverage).toEqual(before.coverage);

    const scheduledIds = draft.schedule.days.flatMap((day) => day.question_ids).sort();
    expect(scheduledIds).toEqual(["q1", "q2", "q3", "q4"]);
  });
});
