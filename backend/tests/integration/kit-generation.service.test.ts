import { afterEach, describe, expect, it, vi } from "vitest";

const { generateValidated } = vi.hoisted(() => ({ generateValidated: vi.fn() }));
vi.mock("../../src/services/ai/gemini.client", () => ({ generateValidated }));

import { generateDraftKit } from "../../src/services/generation/kit-generation.service";
import { CompanyResearchResult } from "../../src/types/research.types";

afterEach(() => {
  generateValidated.mockReset();
});

function fakeResearch(): CompanyResearchResult {
  return {
    companyUrl: "https://example.com",
    finalUrl: "https://example.com",
    status: "success",
    pages: [
      {
        url: "https://example.com/",
        title: "Example Co",
        status: 200,
        contentType: "text/html",
        text: "Example Co builds developer tools for interview preparation.",
        links: [],
        fetchedAt: new Date().toISOString(),
        sourceType: "homepage",
      },
      {
        url: "https://example.com/careers",
        title: "Careers",
        status: 200,
        contentType: "text/html",
        text: "We hire engineers who care about craft.",
        links: [],
        fetchedAt: new Date().toISOString(),
        sourceType: "careers",
      },
    ],
    pagesUsed: 2,
    companyPages: [],
    hiringPages: [],
    failures: [],
    warnings: [],
    fetchedAt: new Date().toISOString(),
  };
}

describe("generateDraftKit (full pipeline, mocked Gemini)", () => {
  it("produces a valid first-pass kit from JD -> requirements -> brief -> role -> questions -> flashcards", async () => {
    generateValidated
      // requirement extraction
      .mockResolvedValueOnce({
        requirements: [
          { text: "5+ years with React", kind: "technical", priority: "must" },
          { text: "Mentors junior engineers", kind: "behavioural", priority: "nice" },
        ],
      })
      // company brief
      .mockResolvedValueOnce({ summary: "Example Co builds developer tools.", what_they_do: "Developer tooling." })
      // role analysis
      .mockResolvedValueOnce({
        title: "Senior Frontend Engineer",
        seniority: "Senior",
        responsibilities: ["Own the React codebase", "Mentor junior engineers"],
      })
      // technical questions
      .mockResolvedValueOnce({
        questions: [{ prompt: "Explain React reconciliation.", answer_outline: "...", difficulty: 2, requirement_ids: ["r1"] }],
      })
      // behavioural questions
      .mockResolvedValueOnce({
        questions: [{ prompt: "Tell me about mentoring a junior engineer.", answer_outline: "...", difficulty: 1, requirement_ids: ["r2"] }],
      })
      // system-design questions (legitimately none for this role)
      .mockResolvedValueOnce({ questions: [] })
      // company-fit questions
      .mockResolvedValueOnce({
        questions: [{ prompt: "Why Example Co?", answer_outline: "...", difficulty: 1, requirement_ids: [] }],
      })
      // flashcards
      .mockResolvedValueOnce({
        flashcards: [{ front: "What is reconciliation?", back: "...", requirement_ids: ["r1"] }],
      });

    const draft = await generateDraftKit({
      jobDescription: "We need a senior frontend engineer with 5+ years of React who can mentor juniors.",
      companyUrl: "https://example.com",
      daysAvailable: 7,
      research: fakeResearch(),
    });

    expect(draft.role.requirements.map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(draft.questions).toHaveLength(3);
    expect(new Set(draft.questions.map((q) => q.id)).size).toBe(3);
    expect(draft.questions.every((q) => q.requirement_ids.every((id) => ["r1", "r2"].includes(id)))).toBe(true);
    expect(draft.flashcards).toHaveLength(1);
    expect(draft.flashcards[0].id).toBe("f1");
    expect(draft.company_brief.sources).toEqual(["https://example.com/", "https://example.com/careers"]);

    // Deterministic schedule allocation over the final question set.
    expect(draft.schedule.days_available).toBe(7);
    expect(draft.schedule.days).toHaveLength(7);
    expect(draft.schedule.days.map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    const scheduledIds = draft.schedule.days.flatMap((d) => d.question_ids);
    expect(new Set(scheduledIds).size).toBe(scheduledIds.length); // no duplicates across days
    expect(scheduledIds.sort()).toEqual(draft.questions.map((q) => q.id).sort()); // every question scheduled exactly once

    // Both requirements are covered by the first-pass questions, so a
    // single coverage check is enough — no second pass is triggered.
    expect(draft.coverage).toEqual({ uncovered_requirement_ids: [], passes: 1 });
    expect(generateValidated).toHaveBeenCalledTimes(8);
  });

  it("keeps a thin job description thin instead of inventing requirements or questions", async () => {
    generateValidated
      // requirement extraction: JD genuinely supports nothing specific
      .mockResolvedValueOnce({ requirements: [] })
      // company brief
      .mockResolvedValueOnce({ summary: "Example Co.", what_they_do: "Unclear from available research." })
      // role analysis
      .mockResolvedValueOnce({ title: "Software Developer", seniority: "Not specified", responsibilities: [] })
      // system-design: no evidence, legitimately empty
      .mockResolvedValueOnce({ questions: [] })
      // company-fit: sparse research, still structurally valid but empty
      .mockResolvedValueOnce({ questions: [] });
      // technical/behavioural are skipped entirely (no matching requirements)
      // flashcards are skipped entirely (nothing to reinforce)

    const draft = await generateDraftKit({
      jobDescription: "Looking for a software developer. Good programming skills required.",
      companyUrl: "https://example.com",
      daysAvailable: 3,
      research: fakeResearch(),
    });

    expect(draft.role.requirements).toEqual([]);
    expect(draft.questions).toEqual([]);
    expect(draft.flashcards).toEqual([]);
    expect(generateValidated).toHaveBeenCalledTimes(5);
  });

  it("runs a targeted second pass to close an uncovered MUST requirement (RULES.md section 24 scenario)", async () => {
    generateValidated
      // requirement extraction: r1=React, r2=Node.js, r3=PostgreSQL, all MUST/technical
      .mockResolvedValueOnce({
        requirements: [
          { text: "React", kind: "technical", priority: "must" },
          { text: "Node.js", kind: "technical", priority: "must" },
          { text: "PostgreSQL", kind: "technical", priority: "must" },
        ],
      })
      .mockResolvedValueOnce({ summary: "Example Co.", what_they_do: "Developer tooling." })
      .mockResolvedValueOnce({ title: "Full Stack Engineer", seniority: "Mid", responsibilities: ["Build features"] })
      // first-pass technical questions: only q1->r1 and q2->r2 — r3 is left uncovered
      .mockResolvedValueOnce({
        questions: [
          { prompt: "Explain React hooks.", answer_outline: "...", difficulty: 1, requirement_ids: ["r1"] },
          { prompt: "Explain the Node.js event loop.", answer_outline: "...", difficulty: 2, requirement_ids: ["r2"] },
        ],
      })
      // behavioural skipped (no behavioural requirements)
      .mockResolvedValueOnce({ questions: [] }) // system-design
      .mockResolvedValueOnce({ questions: [] }) // company-fit
      .mockResolvedValueOnce({ flashcards: [] }) // flashcards
      // second pass: targeted question for the uncovered r3 (PostgreSQL)
      .mockResolvedValueOnce({
        questions: [
          {
            prompt: "How would you design indexes for a large PostgreSQL table?",
            answer_outline: "...",
            difficulty: 2,
            category: "technical",
            requirement_ids: ["r3"],
          },
        ],
      });

    const draft = await generateDraftKit({
      jobDescription: "We need a full stack engineer with React, Node.js, and PostgreSQL experience.",
      companyUrl: "https://example.com",
      daysAvailable: 7,
      research: fakeResearch(),
    });

    expect(draft.questions.map((q) => q.id)).toEqual(["q1", "q2", "q3"]);
    // The original q1/q2 must survive the second pass completely unchanged.
    expect(draft.questions[0]).toMatchObject({ id: "q1", requirement_ids: ["r1"] });
    expect(draft.questions[1]).toMatchObject({ id: "q2", requirement_ids: ["r2"] });
    expect(draft.questions[2]).toMatchObject({ id: "q3", requirement_ids: ["r3"] });
    expect(draft.coverage).toEqual({ uncovered_requirement_ids: [], passes: 2 });
  });

  it("preserves first-pass questions and reports honest coverage when the second pass fails", async () => {
    generateValidated
      .mockResolvedValueOnce({ requirements: [{ text: "PostgreSQL", kind: "technical", priority: "must" }] })
      .mockResolvedValueOnce({ summary: "Example Co.", what_they_do: "Developer tooling." })
      .mockResolvedValueOnce({ title: "Engineer", seniority: "Not specified", responsibilities: [] })
      // technical questions come back empty (model under-delivers on the first pass)
      .mockResolvedValueOnce({ questions: [] })
      .mockResolvedValueOnce({ questions: [] }) // system-design
      .mockResolvedValueOnce({ questions: [] }) // company-fit
      .mockResolvedValueOnce({ flashcards: [] })
      // second pass fails outright (persistently, so the client's own
      // network retry also fails the same way rather than hitting an
      // exhausted mock queue).
      .mockRejectedValue(Object.assign(new Error("down"), { status: 503 }));

    const draft = await generateDraftKit({
      jobDescription: "We need an engineer with PostgreSQL experience.",
      companyUrl: "https://example.com",
      daysAvailable: 5,
      research: fakeResearch(),
    });

    expect(draft.questions).toEqual([]);
    expect(draft.coverage).toEqual({ uncovered_requirement_ids: ["r1"], passes: 2 });
  });

  it("never attempts more than the bounded number of coverage passes", async () => {
    generateValidated
      .mockResolvedValueOnce({ requirements: [{ text: "Kubernetes", kind: "technical", priority: "must" }] })
      .mockResolvedValueOnce({ summary: "Example Co.", what_they_do: "Developer tooling." })
      .mockResolvedValueOnce({ title: "Engineer", seniority: "Not specified", responsibilities: [] })
      .mockResolvedValueOnce({ questions: [] }) // technical: still misses the requirement
      .mockResolvedValueOnce({ questions: [] }) // system-design
      .mockResolvedValueOnce({ questions: [] }) // company-fit
      .mockResolvedValueOnce({ flashcards: [] })
      // second pass also fails to cover it
      .mockResolvedValueOnce({
        questions: [{ prompt: "Unrelated question.", answer_outline: "...", difficulty: 1, category: "technical", requirement_ids: [] }],
      });

    // buildMissingQuestionResponseSchema requires every uncovered id to be
    // referenced, so this malformed response triggers the client's own
    // bounded repair retry (1 extra call) before generateMissingQuestions
    // gives up — accounted for below.
    generateValidated.mockResolvedValueOnce({
      questions: [{ prompt: "Still unrelated.", answer_outline: "...", difficulty: 1, category: "technical", requirement_ids: [] }],
    });

    const draft = await generateDraftKit({
      jobDescription: "We need an engineer with Kubernetes experience.",
      companyUrl: "https://example.com",
      daysAvailable: 5,
      research: fakeResearch(),
    });

    // Exactly 2 coverage passes ever occur, regardless of outcome.
    expect(draft.coverage.passes).toBe(2);
    expect(draft.coverage.uncovered_requirement_ids).toEqual(["r1"]);
  });

  it("schedules the FINAL question set (post second-pass) deterministically, with MUST requirements represented and passing kit validation", async () => {
    generateValidated
      // r1/r2 = MUST technical, r3 = NICE technical
      .mockResolvedValueOnce({
        requirements: [
          { text: "React", kind: "technical", priority: "must" },
          { text: "PostgreSQL", kind: "technical", priority: "must" },
          { text: "GraphQL", kind: "technical", priority: "nice" },
        ],
      })
      .mockResolvedValueOnce({ summary: "Example Co.", what_they_do: "Developer tooling." })
      .mockResolvedValueOnce({ title: "Engineer", seniority: "Mid", responsibilities: ["Build features"] })
      // first pass covers only r1 (React) — r2 (PostgreSQL) is left uncovered
      .mockResolvedValueOnce({
        questions: [{ prompt: "Explain React hooks.", answer_outline: "...", difficulty: 2, requirement_ids: ["r1"] }],
      })
      .mockResolvedValueOnce({ questions: [] }) // system-design
      .mockResolvedValueOnce({ questions: [] }) // company-fit
      .mockResolvedValueOnce({ flashcards: [] })
      // second pass closes the r2 gap
      .mockResolvedValueOnce({
        questions: [
          {
            prompt: "Design an index strategy for a large PostgreSQL table.",
            answer_outline: "...",
            difficulty: 3,
            category: "technical",
            requirement_ids: ["r2"],
          },
        ],
      });

    const draft = await generateDraftKit({
      jobDescription: "React and PostgreSQL required; GraphQL is a plus.",
      companyUrl: "https://example.com",
      daysAvailable: 4,
      research: fakeResearch(),
    });

    // Coverage closed both MUST requirements over 2 passes; the NICE
    // requirement (r3, GraphQL) was never targeted by the second pass and
    // stays honestly reported as uncovered rather than being invented for.
    expect(draft.coverage.passes).toBe(2);
    expect(draft.coverage.uncovered_requirement_ids).toEqual(["r3"]);

    // The schedule operates on the FINAL set — both q1 (first pass) and q2
    // (second pass) are present, exactly once each, across exactly 4 days.
    expect(draft.schedule.days_available).toBe(4);
    expect(draft.schedule.days).toHaveLength(4);
    const scheduledIds = draft.schedule.days.flatMap((d) => d.question_ids);
    expect(scheduledIds.sort()).toEqual(["q1", "q2"]);

    // Both MUST requirements (r1, r2) are covered by a scheduled question;
    // the harder, second-pass MUST question (difficulty 3) is scheduled no
    // later than the easier first-pass MUST question (difficulty 2).
    const dayOfQuestion = (id: string) => draft.schedule.days.find((d) => d.question_ids.includes(id))!.day;
    expect(dayOfQuestion("q2")).toBeLessThanOrEqual(dayOfQuestion("q1"));

    // No Gemini call was involved in producing the schedule itself — the
    // mock queue above was exhausted entirely by generation/coverage steps.
    expect(generateValidated).toHaveBeenCalledTimes(8);

    // generateDraftKit() already ran validateDraftKit() internally; the
    // fact that it resolved (rather than throwing) is itself proof the
    // final kit — including the schedule — passed validation.
  });
});
