import { describe, expect, it } from "vitest";
import { Kit } from "../../src/models/kit.model";
import { buildUpdatedDraftKit } from "../../src/services/kit-update.service";
import { AppError } from "../../src/utils/AppError";

// new Kit({...}) constructs a real Mongoose document (schema defaults,
// subdocument casting) without touching a database — exactly what
// buildUpdatedDraftKit consumes via kit.toObject() in production.
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
        { id: "r2", text: "Testing", kind: "technical", priority: "nice" },
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
        { day: 1, focus: "Technical fundamentals", question_ids: ["q1"], minutes: 15 },
        { day: 2, focus: "Behavioural", question_ids: ["q2"], minutes: 10 },
        { day: 3, focus: "Review and consolidation", question_ids: [], minutes: 0 },
      ],
    },
    coverage: { uncovered_requirement_ids: [], passes: 1 },
    ...overrides,
  });
}

describe("buildUpdatedDraftKit — question edits", () => {
  it("marks a generated question as edited when its content actually changes", () => {
    const kit = fixtureKit();
    const draft = buildUpdatedDraftKit(kit, {
      questions: [
        { id: "q1", prompt: "Explain useEffect specifically.", answer_outline: "...", difficulty: 2, category: "technical" },
        { id: "q2", prompt: "Tell me about testing.", answer_outline: "...", difficulty: 1, category: "behavioural" },
      ],
    });

    const q1 = draft.questions.find((q) => q.id === "q1")!;
    const q2 = draft.questions.find((q) => q.id === "q2")!;
    expect(q1.edited).toBe(true);
    expect(q1.prompt).toBe("Explain useEffect specifically.");
    expect(q2.edited).toBe(false); // unchanged content
  });

  it("marks a question as edited when only its category changes", () => {
    const kit = fixtureKit();
    const draft = buildUpdatedDraftKit(kit, {
      questions: [
        { id: "q1", prompt: "Explain React hooks.", answer_outline: "...", difficulty: 2, category: "system-design" },
        { id: "q2", prompt: "Tell me about testing.", answer_outline: "...", difficulty: 1, category: "behavioural" },
      ],
    });

    const q1 = draft.questions.find((q) => q.id === "q1")!;
    expect(q1.category).toBe("system-design");
    expect(q1.edited).toBe(true);
  });

  it("preserves requirement_ids across an edit — the client cannot supply them", () => {
    const kit = fixtureKit();
    const draft = buildUpdatedDraftKit(kit, {
      questions: [
        { id: "q1", prompt: "Edited.", answer_outline: "...", difficulty: 2, category: "technical" },
        { id: "q2", prompt: "Tell me about testing.", answer_outline: "...", difficulty: 1, category: "behavioural" },
      ],
    });

    expect(draft.questions.find((q) => q.id === "q1")!.requirement_ids).toEqual(["r1"]);
  });

  it("adds a user-created question with a fresh id, origin 'user', and no requirement links", () => {
    const kit = fixtureKit();
    const draft = buildUpdatedDraftKit(kit, {
      questions: [
        { id: "q1", prompt: "Explain React hooks.", answer_outline: "...", difficulty: 2, category: "technical" },
        { id: "q2", prompt: "Tell me about testing.", answer_outline: "...", difficulty: 1, category: "behavioural" },
        { prompt: "My own question.", answer_outline: "My own outline.", difficulty: 3, category: "system-design" },
      ],
    });

    expect(draft.questions).toHaveLength(3);
    const created = draft.questions.find((q) => q.prompt === "My own question.")!;
    expect(created.origin).toBe("user");
    expect(created.edited).toBe(false);
    expect(created.requirement_ids).toEqual([]);
    expect(created.id).not.toBe("q1");
    expect(created.id).not.toBe("q2");
  });

  it("never collides a new user id with an existing generated id", () => {
    const kit = fixtureKit();
    const draft = buildUpdatedDraftKit(kit, {
      questions: [
        { id: "q1", prompt: "Explain React hooks.", answer_outline: "...", difficulty: 2, category: "technical" },
        { id: "q2", prompt: "Tell me about testing.", answer_outline: "...", difficulty: 1, category: "behavioural" },
        { prompt: "First new one.", answer_outline: "...", difficulty: 1, category: "technical" },
        { prompt: "Second new one.", answer_outline: "...", difficulty: 1, category: "technical" },
      ],
    });

    const ids = draft.questions.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("deletes a question omitted from the incoming array", () => {
    const kit = fixtureKit();
    const draft = buildUpdatedDraftKit(kit, {
      questions: [{ id: "q1", prompt: "Explain React hooks.", answer_outline: "...", difficulty: 2, category: "technical" }],
    });

    expect(draft.questions.map((q) => q.id)).toEqual(["q1"]);
  });

  it("reorders questions to match the array order of the patch", () => {
    const kit = fixtureKit();
    const draft = buildUpdatedDraftKit(kit, {
      questions: [
        { id: "q2", prompt: "Tell me about testing.", answer_outline: "...", difficulty: 1, category: "behavioural" },
        { id: "q1", prompt: "Explain React hooks.", answer_outline: "...", difficulty: 2, category: "technical" },
      ],
    });

    expect(draft.questions.map((q) => q.id)).toEqual(["q2", "q1"]);
  });

  it("rejects an id that doesn't exist on the kit", () => {
    const kit = fixtureKit();
    expect(() =>
      buildUpdatedDraftKit(kit, {
        questions: [{ id: "q99", prompt: "?", answer_outline: "...", difficulty: 1, category: "technical" }],
      })
    ).toThrow(AppError);
  });
});

describe("buildUpdatedDraftKit — schedule and coverage reconciliation", () => {
  it("strips a deleted question's id from the schedule and recomputes minutes/focus", () => {
    const kit = fixtureKit();
    const draft = buildUpdatedDraftKit(kit, {
      questions: [{ id: "q2", prompt: "Tell me about testing.", answer_outline: "...", difficulty: 1, category: "behavioural" }],
    });

    const dayOne = draft.schedule.days.find((d) => d.day === 1)!;
    expect(dayOne.question_ids).toEqual([]);
    expect(dayOne.minutes).toBe(0);
    expect(dayOne.focus).toBe("Review and consolidation");

    const dayTwo = draft.schedule.days.find((d) => d.day === 2)!;
    expect(dayTwo.question_ids).toEqual(["q2"]);
    expect(dayTwo.minutes).toBe(10); // untouched day is left exactly as-is
  });

  it("leaves the schedule completely untouched when no questions were patched", () => {
    const kit = fixtureKit();
    const draft = buildUpdatedDraftKit(kit, { company_brief: { summary: "New.", what_they_do: "New." } });

    expect(draft.schedule).toEqual({
      days_available: 3,
      days: [
        { day: 1, focus: "Technical fundamentals", question_ids: ["q1"], minutes: 15 },
        { day: 2, focus: "Behavioural", question_ids: ["q2"], minutes: 10 },
        { day: 3, focus: "Review and consolidation", question_ids: [], minutes: 0 },
      ],
    });
  });

  it("recomputes coverage using the existing coverage service when a question is deleted", () => {
    const kit = fixtureKit();
    const draft = buildUpdatedDraftKit(kit, {
      questions: [{ id: "q2", prompt: "Tell me about testing.", answer_outline: "...", difficulty: 1, category: "behavioural" }],
    });

    // q1 was the only question covering the MUST requirement r1.
    expect(draft.coverage.uncovered_requirement_ids).toEqual(["r1"]);
    expect(draft.coverage.passes).toBe(1); // an edit is not a new generation pass
  });

  it("does not recompute coverage when questions weren't part of the patch", () => {
    const kit = fixtureKit({ coverage: { uncovered_requirement_ids: ["r2"], passes: 2 } });
    const draft = buildUpdatedDraftKit(kit, { company_brief: { summary: "New.", what_they_do: "New." } });

    expect(draft.coverage).toEqual({ uncovered_requirement_ids: ["r2"], passes: 2 });
  });
});

describe("buildUpdatedDraftKit — flashcards", () => {
  it("marks a generated flashcard as edited when its content changes", () => {
    const kit = fixtureKit();
    const draft = buildUpdatedDraftKit(kit, {
      flashcards: [{ id: "f1", front: "What is a hook, precisely?", back: "..." }],
    });

    const f1 = draft.flashcards.find((f) => f.id === "f1")!;
    expect(f1.edited).toBe(true);
    expect(f1.front).toBe("What is a hook, precisely?");
  });

  it("adds a user-created flashcard with origin 'user'", () => {
    const kit = fixtureKit();
    const draft = buildUpdatedDraftKit(kit, {
      flashcards: [{ id: "f1", front: "What is a hook?", back: "..." }, { front: "My card.", back: "My answer." }],
    });

    const created = draft.flashcards.find((f) => f.front === "My card.")!;
    expect(created.origin).toBe("user");
    expect(created.requirement_ids).toEqual([]);
  });

  it("deletes a flashcard omitted from the incoming array", () => {
    const kit = fixtureKit();
    const draft = buildUpdatedDraftKit(kit, { flashcards: [] });
    expect(draft.flashcards).toEqual([]);
  });
});

describe("buildUpdatedDraftKit — company brief", () => {
  it("marks the brief as edited only when content actually changes", () => {
    const kit = fixtureKit();
    const unchanged = buildUpdatedDraftKit(kit, {
      company_brief: { summary: "Old summary.", what_they_do: "Old description." },
    });
    expect(unchanged.company_brief.edited).toBe(false);

    const changed = buildUpdatedDraftKit(kit, {
      company_brief: { summary: "New summary.", what_they_do: "Old description." },
    });
    expect(changed.company_brief.edited).toBe(true);
    expect(changed.company_brief.summary).toBe("New summary.");
  });

  it("preserves sources — the client cannot supply them", () => {
    const kit = fixtureKit();
    const draft = buildUpdatedDraftKit(kit, { company_brief: { summary: "New.", what_they_do: "New." } });
    expect(draft.company_brief.sources).toEqual(["https://example.com"]);
  });
});

describe("buildUpdatedDraftKit — final validation", () => {
  it("returns a kit that satisfies the existing draft kit schema after edits", () => {
    const kit = fixtureKit();
    const draft = buildUpdatedDraftKit(kit, {
      questions: [
        { id: "q1", prompt: "Edited.", answer_outline: "...", difficulty: 3, category: "system-design" },
        { prompt: "New one.", answer_outline: "...", difficulty: 1, category: "company-fit" },
      ],
    });

    // Buiding the draft already ran it through validateDraftKit internally;
    // reaching this line without throwing is the assertion. Spot-check a
    // couple of invariants directly too.
    const ids = draft.questions.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    draft.questions.forEach((q) => {
      q.requirement_ids.forEach((id) => {
        expect(draft.role.requirements.some((r) => r.id === id)).toBe(true);
      });
    });
  });
});
