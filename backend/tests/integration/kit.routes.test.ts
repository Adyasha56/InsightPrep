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
