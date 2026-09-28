import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const { generateContent } = vi.hoisted(() => ({ generateContent: vi.fn() }));
const { groqCreate } = vi.hoisted(() => ({ groqCreate: vi.fn() }));
// A plain mutable object referenced by the mock factory below, so each test
// can set GROQ_API_KEY to control whether the fallback path is reachable —
// this decouples test behavior from whatever happens to be in the real
// local .env (which may or may not have a real Groq key configured).
const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    GEMINI_API_KEY: "test-gemini-key",
    GEMINI_MODEL: "test-gemini-model",
    GEMINI_TIMEOUT_MS: 1000,
    GEMINI_MAX_RETRIES: 2,
    GROQ_API_KEY: undefined as string | undefined,
    GROQ_MODEL: "test-groq-model",
  },
}));

vi.mock("../../src/config/env", () => ({ env: mockEnv }));

vi.mock("@google/genai", () => ({
  // A plain function (not an arrow function) so `new GoogleGenAI(...)` in
  // the client under test can actually construct it.
  GoogleGenAI: vi.fn().mockImplementation(function GoogleGenAI(this: { models: unknown }) {
    this.models = { generateContent };
  }),
}));

vi.mock("groq-sdk", () => ({
  default: vi.fn().mockImplementation(function Groq(this: { chat: unknown }) {
    this.chat = { completions: { create: groqCreate } };
  }),
}));

import { generateValidated } from "../../src/services/ai/gemini.client";

afterEach(() => {
  generateContent.mockReset();
  groqCreate.mockReset();
  mockEnv.GROQ_API_KEY = undefined;
});

const schema = z.object({ value: z.string() });
const responseJsonSchema = {
  type: "object",
  properties: { value: { type: "string" } },
  required: ["value"],
};

function textResponse(text: string) {
  return { text };
}

function groqResponse(content: string) {
  return { choices: [{ message: { content } }] };
}

describe("generateValidated", () => {
  it("parses a plain JSON response", async () => {
    generateContent.mockResolvedValueOnce(textResponse('{"value":"ok"}'));

    const result = await generateValidated({ systemInstruction: "sys", prompt: "p", responseJsonSchema, schema });

    expect(result.value).toBe("ok");
  });

  it("strips a markdown code fence before parsing", async () => {
    generateContent.mockResolvedValueOnce(textResponse('```json\n{"value":"fenced"}\n```'));

    const result = await generateValidated({ systemInstruction: "sys", prompt: "p", responseJsonSchema, schema });

    expect(result.value).toBe("fenced");
  });

  it("retries once on invalid JSON and succeeds on the repair attempt", async () => {
    generateContent.mockResolvedValueOnce(textResponse("not json"));
    generateContent.mockResolvedValueOnce(textResponse('{"value":"recovered"}'));

    const result = await generateValidated({ systemInstruction: "sys", prompt: "p", responseJsonSchema, schema });

    expect(result.value).toBe("recovered");
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it("throws a structured LLM_INVALID_RESPONSE error when the repair attempt also fails", async () => {
    generateContent.mockResolvedValue(textResponse("still not json"));

    await expect(
      generateValidated({ systemInstruction: "sys", prompt: "p", responseJsonSchema, schema, maxRepairAttempts: 1 })
    ).rejects.toMatchObject({ code: "LLM_INVALID_RESPONSE" });
    expect(groqCreate).not.toHaveBeenCalled();
  });

  it("retries a transient rate-limit failure and then succeeds", async () => {
    const rateLimitError = Object.assign(new Error("rate limited"), { status: 429 });
    generateContent.mockRejectedValueOnce(rateLimitError);
    generateContent.mockResolvedValueOnce(textResponse('{"value":"ok"}'));

    const result = await generateValidated({
      systemInstruction: "sys",
      prompt: "p",
      responseJsonSchema,
      schema,
      maxNetworkRetries: 1,
    });

    expect(result.value).toBe("ok");
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it("gives up after exhausting network retries when Groq isn't configured", async () => {
    const serverError = Object.assign(new Error("down"), { status: 503 });
    generateContent.mockRejectedValue(serverError);

    await expect(
      generateValidated({
        systemInstruction: "sys",
        prompt: "p",
        responseJsonSchema,
        schema,
        maxNetworkRetries: 1,
        maxRepairAttempts: 0,
      })
    ).rejects.toMatchObject({ code: "LLM_UNAVAILABLE" });
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(groqCreate).not.toHaveBeenCalled();
  });

  it("does not retry a non-transient error, and does not fall back to Groq even if configured", async () => {
    mockEnv.GROQ_API_KEY = "test-groq-key";
    const badRequestError = Object.assign(new Error("bad request"), { status: 400 });
    generateContent.mockRejectedValue(badRequestError);

    await expect(
      generateValidated({ systemInstruction: "sys", prompt: "p", responseJsonSchema, schema, maxRepairAttempts: 0 })
    ).rejects.toMatchObject({ code: "LLM_REQUEST_REJECTED" });
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(groqCreate).not.toHaveBeenCalled();
  });
});

describe("generateValidated — Groq fallback", () => {
  it("falls back to Groq when Gemini exhausts retries with a rate-limit error, and Groq is configured", async () => {
    mockEnv.GROQ_API_KEY = "test-groq-key";
    const rateLimitError = Object.assign(new Error("rate limited"), { status: 429 });
    generateContent.mockRejectedValue(rateLimitError);
    groqCreate.mockResolvedValueOnce(groqResponse('{"value":"from-groq"}'));

    const result = await generateValidated({
      systemInstruction: "sys",
      prompt: "p",
      responseJsonSchema,
      schema,
      maxNetworkRetries: 0,
      maxRepairAttempts: 0,
    });

    expect(result.value).toBe("from-groq");
    expect(groqCreate).toHaveBeenCalledTimes(1);
  });

  it("falls back to Groq when Gemini is unavailable (5xx), and Groq is configured", async () => {
    mockEnv.GROQ_API_KEY = "test-groq-key";
    const serverError = Object.assign(new Error("down"), { status: 503 });
    generateContent.mockRejectedValue(serverError);
    groqCreate.mockResolvedValueOnce(groqResponse('{"value":"from-groq"}'));

    const result = await generateValidated({
      systemInstruction: "sys",
      prompt: "p",
      responseJsonSchema,
      schema,
      maxNetworkRetries: 0,
      maxRepairAttempts: 0,
    });

    expect(result.value).toBe("from-groq");
  });

  it("does not fall back to Groq when it isn't configured, even for a retryable Gemini error", async () => {
    const serverError = Object.assign(new Error("down"), { status: 503 });
    generateContent.mockRejectedValue(serverError);

    await expect(
      generateValidated({ systemInstruction: "sys", prompt: "p", responseJsonSchema, schema, maxNetworkRetries: 0, maxRepairAttempts: 0 })
    ).rejects.toMatchObject({ code: "LLM_UNAVAILABLE" });
    expect(groqCreate).not.toHaveBeenCalled();
  });

  it("propagates a Groq failure if the fallback itself also fails", async () => {
    mockEnv.GROQ_API_KEY = "test-groq-key";
    const serverError = Object.assign(new Error("down"), { status: 503 });
    generateContent.mockRejectedValue(serverError);
    groqCreate.mockRejectedValue(Object.assign(new Error("groq down"), { status: 503 }));

    await expect(
      generateValidated({ systemInstruction: "sys", prompt: "p", responseJsonSchema, schema, maxNetworkRetries: 0, maxRepairAttempts: 0 })
    ).rejects.toMatchObject({ code: "LLM_UNAVAILABLE", message: expect.stringContaining("Groq") });
  });
});
