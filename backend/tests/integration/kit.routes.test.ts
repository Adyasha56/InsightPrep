import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";

const { generateValidated } = vi.hoisted(() => ({ generateValidated: vi.fn() }));
vi.mock("../../src/services/ai/gemini.client", () => ({ generateValidated }));

import { createApp } from "../../src/app";
import { User } from "../../src/models/user.model";
import { Kit } from "../../src/models/kit.model";
import { startTestMongod, TestMongod } from "../helpers/testMongod";

const TEST_PORT = 27419;
const app = createApp();

function stubCompanySite(): void {
  const mockFetch = vi.fn(async (input: string | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const path = new URL(url).pathname;

    if (path === "/robots.txt") {
      return new Response("Not found", { status: 404 });
    }
    return new Response("<html><head><title>Mock Co</title></head><body><p>We build things.</p></body></html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    });
  });
  vi.stubGlobal("fetch", mockFetch);
}

function queueSuccessfulGeneration(): void {
  generateValidated
    // requirement extraction
    .mockResolvedValueOnce({
      requirements: [{ text: "5+ years with React", kind: "technical", priority: "must" }],
    })
    // company brief
    .mockResolvedValueOnce({ summary: "Mock Co builds things.", what_they_do: "Things." })
    // role analysis
    .mockResolvedValueOnce({ title: "Engineer", seniority: "Not specified", responsibilities: [] })
    // technical questions (behavioural is skipped: no behavioural requirements)
    .mockResolvedValueOnce({
      questions: [{ prompt: "Explain React reconciliation.", answer_outline: "...", difficulty: 1, requirement_ids: ["r1"] }],
    })
    // system-design questions
    .mockResolvedValueOnce({ questions: [] })
    // company-fit questions
    .mockResolvedValueOnce({ questions: [{ prompt: "Why Mock Co?", answer_outline: "...", difficulty: 1, requirement_ids: [] }] })
    // flashcards
    .mockResolvedValueOnce({ flashcards: [{ front: "Reconciliation?", back: "...", requirement_ids: ["r1"] }] });
}

async function registerAndLogin(email: string) {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send({ email, password: "password123" });
  return agent;
}

describe("kit routes", () => {
  let mongod: TestMongod;

  beforeAll(async () => {
    mongod = await startTestMongod(TEST_PORT);
    await mongoose.connect(`mongodb://127.0.0.1:${TEST_PORT}/insightprep_test`);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  afterEach(async () => {
    await User.deleteMany({});
    await Kit.deleteMany({});
    generateValidated.mockReset();
    vi.unstubAllGlobals();
  });

  it("requires authentication to create a kit", async () => {
    const res = await request(app)
      .post("/api/kits")
      .send({ job_description: "JD", company_url: "http://mock-company.test", days_available: 5 });

    expect(res.status).toBe(401);
  });

  it("prevents a user from reading or generating another user's kit", async () => {
    const owner = await registerAndLogin("owner@example.com");
    const intruder = await registerAndLogin("intruder@example.com");

    const createRes = await owner
      .post("/api/kits")
      .send({ job_description: "JD", company_url: "http://mock-company.test", days_available: 5 });
    const kitId = createRes.body.data.kit._id;

    const readRes = await intruder.get(`/api/kits/${kitId}`);
    expect(readRes.status).toBe(403);
    expect(readRes.body.error.code).toBe("UNAUTHORIZED_ACCESS");

    const generateRes = await intruder.post(`/api/kits/${kitId}/generate`);
    expect(generateRes.status).toBe(403);
    expect(generateValidated).not.toHaveBeenCalled();
  });

  it("lists only the current user's kits, newest first", async () => {
    const owner = await registerAndLogin("lister@example.com");
    const other = await registerAndLogin("other@example.com");

    await owner.post("/api/kits").send({ job_description: "First", company_url: "https://example.com", days_available: 3 });
    await owner.post("/api/kits").send({ job_description: "Second", company_url: "https://example.com", days_available: 5 });
    await other.post("/api/kits").send({ job_description: "Not mine", company_url: "https://example.com", days_available: 4 });

    const res = await owner.get("/api/kits");

    expect(res.status).toBe(200);
    expect(res.body.data.kits).toHaveLength(2);
    expect(res.body.data.kits.map((k: { source: { job_description: string } }) => k.source.job_description)).toEqual([
      "Second",
      "First",
    ]);
    // Lean projection: heavy generated fields are absent from the list.
    expect(res.body.data.kits[0].questions).toBeUndefined();
  });

  it("requires authentication to list kits", async () => {
    const res = await request(app).get("/api/kits");
    expect(res.status).toBe(401);
  });

  it("returns KIT_NOT_FOUND for a nonexistent kit", async () => {
    const owner = await registerAndLogin("owner2@example.com");
    const res = await owner.get("/api/kits/507f1f77bcf86cd799439011");

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("KIT_NOT_FOUND");
  });

  it("runs research + generation and persists a completed first-pass draft", async () => {
    stubCompanySite();
    queueSuccessfulGeneration();

    const owner = await registerAndLogin("generator@example.com");
    const createRes = await owner.post("/api/kits").send({
      job_description: "We need an engineer with 5+ years of React experience.",
      company_url: "http://mock-company.test",
      days_available: 5,
    });
    expect(createRes.body.data.kit.generationStatus).toBe("idle");
    const kitId = createRes.body.data.kit._id;

    const generateRes = await owner.post(`/api/kits/${kitId}/generate`);

    expect(generateRes.status).toBe(200);
    const kit = generateRes.body.data.kit;
    expect(kit.generationStatus).toBe("completed");
    expect(kit.role.requirements).toHaveLength(1);
    expect(kit.questions.length).toBeGreaterThan(0);
    expect(kit.flashcards).toHaveLength(1);
    expect(kit.schedule.days_available).toBe(5);
    expect(kit.schedule.days).toHaveLength(5);
    expect(kit.schedule.days.map((d: { day: number }) => d.day)).toEqual([1, 2, 3, 4, 5]);
  });

  async function createGeneratedKit(agent: ReturnType<typeof request.agent>, daysAvailable = 5) {
    stubCompanySite();
    queueSuccessfulGeneration();

    const createRes = await agent.post("/api/kits").send({
      job_description: "We need an engineer with 5+ years of React experience.",
      company_url: "http://mock-company.test",
      days_available: daysAvailable,
    });
    const kitId = createRes.body.data.kit._id;
    const generateRes = await agent.post(`/api/kits/${kitId}/generate`);
    return { kitId, kit: generateRes.body.data.kit };
  }

  it("persists question and company brief edits so the kit reopens with the same state", async () => {
    const owner = await registerAndLogin("editor@example.com");
    const { kitId, kit } = await createGeneratedKit(owner);
    const originalQuestionId = kit.questions[0].id;

    const patchRes = await owner.patch(`/api/kits/${kitId}`).send({
      company_brief: { summary: "A hand-written summary.", what_they_do: "Mock Co builds things." },
      questions: [
        { id: originalQuestionId, prompt: "Edited prompt.", answer_outline: "Edited outline.", difficulty: 3, category: "technical" },
      ],
    });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.kit.company_brief.summary).toBe("A hand-written summary.");
    expect(patchRes.body.data.kit.company_brief.edited).toBe(true);
    expect(patchRes.body.data.kit.questions[0].edited).toBe(true);

    // "Reopen" the kit — a fresh GET must reflect the saved edits.
    const reopened = await owner.get(`/api/kits/${kitId}`);
    expect(reopened.body.data.kit.company_brief.summary).toBe("A hand-written summary.");
    expect(reopened.body.data.kit.questions[0].prompt).toBe("Edited prompt.");
    expect(reopened.body.data.kit.questions[0].edited).toBe(true);
  });

  it("adds a user-created question and reflects it after reopening", async () => {
    const owner = await registerAndLogin("adder@example.com");
    const { kitId, kit } = await createGeneratedKit(owner);

    const patchRes = await owner.patch(`/api/kits/${kitId}`).send({
      questions: [
        ...kit.questions.map((q: { id: string; prompt: string; answer_outline: string; difficulty: number; category: string }) => ({
          id: q.id,
          prompt: q.prompt,
          answer_outline: q.answer_outline,
          difficulty: q.difficulty,
          category: q.category,
        })),
        { prompt: "My own question.", answer_outline: "My own outline.", difficulty: 2, category: "technical" },
      ],
    });

    expect(patchRes.status).toBe(200);
    const created = patchRes.body.data.kit.questions.find((q: { prompt: string }) => q.prompt === "My own question.");
    expect(created.origin).toBe("user");
    expect(created.requirement_ids).toEqual([]);

    const reopened = await owner.get(`/api/kits/${kitId}`);
    expect(reopened.body.data.kit.questions).toHaveLength(kit.questions.length + 1);
  });

  it("deletes a question, removing stale schedule references and recomputing coverage", async () => {
    const owner = await registerAndLogin("deleter@example.com");
    const { kitId } = await createGeneratedKit(owner);

    const patchRes = await owner.patch(`/api/kits/${kitId}`).send({ questions: [] });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.kit.questions).toEqual([]);
    // No question survives, so no schedule day can still reference one.
    patchRes.body.data.kit.schedule.days.forEach((day: { question_ids: string[] }) => {
      expect(day.question_ids).toEqual([]);
    });
    expect(patchRes.body.data.kit.coverage.uncovered_requirement_ids).toContain("r1");
  });

  it("reorders questions to match the submitted array order", async () => {
    const owner = await registerAndLogin("reorderer@example.com");
    const { kitId, kit } = await createGeneratedKit(owner);
    const ids = kit.questions.map((q: { id: string }) => q.id);
    expect(ids.length).toBeGreaterThan(1);

    const reordered = [...kit.questions].reverse();
    const patchRes = await owner.patch(`/api/kits/${kitId}`).send({
      questions: reordered.map((q) => ({
        id: q.id,
        prompt: q.prompt,
        answer_outline: q.answer_outline,
        difficulty: q.difficulty,
        category: q.category,
      })),
    });

    expect(patchRes.body.data.kit.questions.map((q: { id: string }) => q.id)).toEqual(reordered.map((q) => q.id));
  });

  it("prevents a user from editing another user's kit", async () => {
    const owner = await registerAndLogin("kit-owner@example.com");
    const intruder = await registerAndLogin("kit-intruder@example.com");
    const { kitId } = await createGeneratedKit(owner);

    const res = await intruder.patch(`/api/kits/${kitId}`).send({ company_brief: { summary: "Hijacked.", what_they_do: "X" } });

    expect(res.status).toBe(403);
    const stillOwners = await owner.get(`/api/kits/${kitId}`);
    expect(stillOwners.body.data.kit.company_brief.summary).not.toBe("Hijacked.");
  });

  it("rejects editing a kit that has not been generated yet", async () => {
    const owner = await registerAndLogin("premature@example.com");
    const createRes = await owner
      .post("/api/kits")
      .send({ job_description: "JD", company_url: "https://example.com", days_available: 5 });
    const kitId = createRes.body.data.kit._id;

    const res = await owner.patch(`/api/kits/${kitId}`).send({ company_brief: { summary: "X", what_they_do: "Y" } });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an unknown question id instead of silently accepting it", async () => {
    const owner = await registerAndLogin("badref@example.com");
    const { kitId } = await createGeneratedKit(owner);

    const res = await owner.patch(`/api/kits/${kitId}`).send({
      questions: [{ id: "q999", prompt: "?", answer_outline: "...", difficulty: 1, category: "technical" }],
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_KIT");
  });

  it("rejects a malformed edit payload (invalid category) before it reaches the service", async () => {
    const owner = await registerAndLogin("badcategory@example.com");
    const { kitId, kit } = await createGeneratedKit(owner);

    const res = await owner.patch(`/api/kits/${kitId}`).send({
      questions: [{ id: kit.questions[0].id, prompt: "?", answer_outline: "...", difficulty: 1, category: "not-a-real-category" }],
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("regenerates the company brief, leaving questions/flashcards/schedule untouched", async () => {
    const owner = await registerAndLogin("regen-brief@example.com");
    const { kitId, kit } = await createGeneratedKit(owner);

    stubCompanySite();
    generateValidated.mockResolvedValueOnce({ summary: "Freshly regenerated summary.", what_they_do: "Freshly regenerated." });

    const res = await owner.post(`/api/kits/${kitId}/regenerate`).send({ target: "company_brief" });

    expect(res.status).toBe(200);
    expect(res.body.data.kit.company_brief.summary).toBe("Freshly regenerated summary.");
    expect(res.body.data.kit.company_brief.edited).toBe(false);
    expect(res.body.data.kit.questions).toEqual(kit.questions);
    expect(res.body.data.kit.flashcards).toEqual(kit.flashcards);
    expect(res.body.data.kit.schedule).toEqual(kit.schedule);

    const reopened = await owner.get(`/api/kits/${kitId}`);
    expect(reopened.body.data.kit.company_brief.summary).toBe("Freshly regenerated summary.");
  });

  it("regenerates a question category, replacing only generated+unedited questions in it", async () => {
    const owner = await registerAndLogin("regen-category@example.com");
    const { kitId, kit } = await createGeneratedKit(owner);
    const originalTechnicalQuestion = kit.questions.find((q: { category: string }) => q.category === "technical");
    expect(originalTechnicalQuestion).toBeTruthy();

    // Add a user-created technical question first, so this regeneration has
    // something concrete to protect.
    const patchRes = await owner.patch(`/api/kits/${kitId}`).send({
      questions: [
        ...kit.questions.map((q: { id: string; prompt: string; answer_outline: string; difficulty: number; category: string }) => ({
          id: q.id,
          prompt: q.prompt,
          answer_outline: q.answer_outline,
          difficulty: q.difficulty,
          category: q.category,
        })),
        { prompt: "My own technical question.", answer_outline: "My own outline.", difficulty: 2, category: "technical" },
      ],
    });
    const userQuestionId = patchRes.body.data.kit.questions.find((q: { prompt: string }) => q.prompt === "My own technical question.")
      .id;

    stubCompanySite();
    generateValidated.mockResolvedValueOnce({
      questions: [{ prompt: "Freshly regenerated technical question.", answer_outline: "...", difficulty: 2, requirement_ids: ["r1"] }],
    });

    const res = await owner.post(`/api/kits/${kitId}/regenerate`).send({ target: "category", category: "technical" });

    expect(res.status).toBe(200);
    const questions = res.body.data.kit.questions as { id: string; prompt: string; category: string; origin: string }[];
    // The original generated-and-unedited technical question is gone.
    expect(questions.some((q) => q.id === originalTechnicalQuestion.id)).toBe(false);
    // The user-created one survives, protected.
    expect(questions.find((q) => q.id === userQuestionId)).toEqual(expect.objectContaining({ origin: "user" }));
    // Fresh content was added.
    expect(questions.some((q) => q.prompt === "Freshly regenerated technical question.")).toBe(true);
    // The unrelated company-fit question is untouched.
    const originalCompanyFitQuestion = kit.questions.find((q: { category: string }) => q.category === "company-fit");
    expect(questions.find((q) => q.id === originalCompanyFitQuestion.id)).toBeTruthy();

    const reopened = await owner.get(`/api/kits/${kitId}`);
    expect(reopened.body.data.kit.questions.map((q: { id: string }) => q.id)).toEqual(questions.map((q) => q.id));
  });

  it("regenerates the schedule without calling Gemini or fetching the company site", async () => {
    const owner = await registerAndLogin("regen-schedule@example.com");
    const { kitId, kit } = await createGeneratedKit(owner);
    generateValidated.mockReset();

    const res = await owner.post(`/api/kits/${kitId}/regenerate`).send({ target: "schedule" });

    expect(res.status).toBe(200);
    expect(generateValidated).not.toHaveBeenCalled();
    expect(res.body.data.kit.questions).toEqual(kit.questions);
    expect(res.body.data.kit.company_brief).toEqual(kit.company_brief);
    expect(res.body.data.kit.schedule.days_available).toBe(kit.schedule.days_available);
  });

  it("prevents a user from regenerating another user's kit", async () => {
    const owner = await registerAndLogin("regen-owner@example.com");
    const intruder = await registerAndLogin("regen-intruder@example.com");
    const { kitId } = await createGeneratedKit(owner);
    generateValidated.mockClear();

    const res = await intruder.post(`/api/kits/${kitId}/regenerate`).send({ target: "schedule" });

    expect(res.status).toBe(403);
    expect(generateValidated).not.toHaveBeenCalled();
  });

  it("rejects regenerating a kit that has not been generated yet", async () => {
    const owner = await registerAndLogin("regen-premature@example.com");
    const createRes = await owner
      .post("/api/kits")
      .send({ job_description: "JD", company_url: "https://example.com", days_available: 5 });
    const kitId = createRes.body.data.kit._id;

    const res = await owner.post(`/api/kits/${kitId}/regenerate`).send({ target: "schedule" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a malformed regenerate request body", async () => {
    const owner = await registerAndLogin("regen-badbody@example.com");
    const { kitId } = await createGeneratedKit(owner);

    const missingCategory = await owner.post(`/api/kits/${kitId}/regenerate`).send({ target: "category" });
    expect(missingCategory.status).toBe(400);
    expect(missingCategory.body.error.code).toBe("VALIDATION_ERROR");

    const unknownTarget = await owner.post(`/api/kits/${kitId}/regenerate`).send({ target: "flashcards" });
    expect(unknownTarget.status).toBe(400);
    expect(unknownTarget.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("leaves the kit completed and its content untouched when a category regeneration fails", async () => {
    const owner = await registerAndLogin("regen-failure@example.com");
    const { kitId, kit } = await createGeneratedKit(owner);

    stubCompanySite();
    generateValidated.mockRejectedValue(Object.assign(new Error("down"), { status: 503 }));

    const res = await owner.post(`/api/kits/${kitId}/regenerate`).send({ target: "category", category: "technical" });

    expect(res.status).not.toBe(200);

    const persisted = await Kit.findById(kitId);
    expect(persisted?.generationStatus).toBe("completed");
    expect(persisted?.questions.map((q) => q.id)).toEqual(kit.questions.map((q: { id: string }) => q.id));
  });

  it("records flashcard confidence and reflects it after reopening", async () => {
    const owner = await registerAndLogin("practice-record@example.com");
    const { kitId, kit } = await createGeneratedKit(owner);
    const flashcardId = kit.flashcards[0].id;

    const res = await owner.patch(`/api/kits/${kitId}/flashcards/${flashcardId}/practice`).send({ confidence: "high" });

    expect(res.status).toBe(200);
    expect(res.body.data.kit.flashcards.find((f: { id: string }) => f.id === flashcardId).confidence).toBe("high");

    const reopened = await owner.get(`/api/kits/${kitId}`);
    expect(reopened.body.data.kit.flashcards.find((f: { id: string }) => f.id === flashcardId).confidence).toBe("high");
  });

  it("does not affect questions, coverage, or other flashcards when recording confidence", async () => {
    const owner = await registerAndLogin("practice-isolated@example.com");
    const { kitId, kit } = await createGeneratedKit(owner);
    const flashcardId = kit.flashcards[0].id;

    const res = await owner.patch(`/api/kits/${kitId}/flashcards/${flashcardId}/practice`).send({ confidence: "low" });

    expect(res.status).toBe(200);
    expect(res.body.data.kit.questions).toEqual(kit.questions);
    expect(res.body.data.kit.coverage).toEqual(kit.coverage);
  });

  it("prevents a user from recording practice confidence on another user's kit", async () => {
    const owner = await registerAndLogin("practice-owner@example.com");
    const intruder = await registerAndLogin("practice-intruder@example.com");
    const { kitId, kit } = await createGeneratedKit(owner);
    const flashcardId = kit.flashcards[0].id;

    const res = await intruder.patch(`/api/kits/${kitId}/flashcards/${flashcardId}/practice`).send({ confidence: "high" });

    expect(res.status).toBe(403);
  });

  it("rejects recording practice on a kit that has not been generated yet", async () => {
    const owner = await registerAndLogin("practice-premature@example.com");
    const createRes = await owner
      .post("/api/kits")
      .send({ job_description: "JD", company_url: "https://example.com", days_available: 5 });
    const kitId = createRes.body.data.kit._id;

    const res = await owner.patch(`/api/kits/${kitId}/flashcards/f1/practice`).send({ confidence: "high" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an unknown flashcard id", async () => {
    const owner = await registerAndLogin("practice-badref@example.com");
    const { kitId } = await createGeneratedKit(owner);

    const res = await owner.patch(`/api/kits/${kitId}/flashcards/f999/practice`).send({ confidence: "high" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_KIT");
  });

  it("rejects an invalid confidence value", async () => {
    const owner = await registerAndLogin("practice-badvalue@example.com");
    const { kitId, kit } = await createGeneratedKit(owner);
    const flashcardId = kit.flashcards[0].id;

    const res = await owner.patch(`/api/kits/${kitId}/flashcards/${flashcardId}/practice`).send({ confidence: "sort-of" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("marks a kit as failed with structured error info when generation fails", async () => {
    stubCompanySite();
    generateValidated.mockRejectedValue(Object.assign(new Error("down"), { status: 503 }));

    const owner = await registerAndLogin("failure@example.com");
    const createRes = await owner.post("/api/kits").send({
      job_description: "Some JD",
      company_url: "http://mock-company.test",
      days_available: 5,
    });
    const kitId = createRes.body.data.kit._id;

    const generateRes = await owner.post(`/api/kits/${kitId}/generate`);
    expect(generateRes.status).not.toBe(200);

    const persisted = await Kit.findById(kitId);
    expect(persisted?.generationStatus).toBe("failed");
    expect(persisted?.generationError?.code).toBeTruthy();
  });
});
