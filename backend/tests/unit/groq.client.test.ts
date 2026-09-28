import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const { groqCreate } = vi.hoisted(() => ({ groqCreate: vi.fn() }));
const { mockEnv } = vi.hoisted(() => ({
  mockEnv: { GROQ_API_KEY: undefined as string | undefined, GROQ_MODEL: "test-groq-model" },
}));

vi.mock("../../src/config/env", () => ({ env: mockEnv }));

vi.mock("groq-sdk", () => ({
  default: vi.fn().mockImplementation(function Groq(this: { chat: unknown }) {
    this.chat = { completions: { create: groqCreate } };
  }),
}));

import { generateValidatedWithGroq, isGroqConfigured } from "../../src/services/ai/groq.client";

afterEach(() => {
  groqCreate.mockReset();
  mockEnv.GROQ_API_KEY = undefined;
});

const schema = z.object({ value: z.string() });
const responseJsonSchema = { type: "object", properties: { value: { type: "string" } }, required: ["value"] };

function groqResponse(content: string) {
  return { choices: [{ message: { content } }] };
}

describe("isGroqConfigured", () => {
  it("is false when GROQ_API_KEY is unset", () => {
    expect(isGroqConfigured()).toBe(false);
  });

  it("is true when GROQ_API_KEY is set", () => {
    mockEnv.GROQ_API_KEY = "key";
    expect(isGroqConfigured()).toBe(true);
  });
});

describe("generateValidatedWithGroq", () => {
  it("throws LLM_NOT_CONFIGURED if called without a key", async () => {
    await expect(
      generateValidatedWithGroq({ systemInstruction: "sys", prompt: "p", responseJsonSchema, schema })
    ).rejects.toMatchObject({ code: "LLM_NOT_CONFIGURED" });
    expect(groqCreate).not.toHaveBeenCalled();
  });

  it("parses a plain JSON response", async () => {
    mockEnv.GROQ_API_KEY = "key";
    groqCreate.mockResolvedValueOnce(groqResponse('{"value":"ok"}'));

    const result = await generateValidatedWithGroq({ systemInstruction: "sys", prompt: "p", responseJsonSchema, schema });

    expect(result.value).toBe("ok");
    expect(groqCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: "test-groq-model", response_format: { type: "json_object" } })
    );
  });

  it("strips a markdown code fence before parsing", async () => {
    mockEnv.GROQ_API_KEY = "key";
    groqCreate.mockResolvedValueOnce(groqResponse('```json\n{"value":"fenced"}\n```'));

    const result = await generateValidatedWithGroq({ systemInstruction: "sys", prompt: "p", responseJsonSchema, schema });

    expect(result.value).toBe("fenced");
  });

  it("retries once on invalid JSON and succeeds on the repair attempt", async () => {
    mockEnv.GROQ_API_KEY = "key";
    groqCreate.mockResolvedValueOnce(groqResponse("not json"));
    groqCreate.mockResolvedValueOnce(groqResponse('{"value":"recovered"}'));

    const result = await generateValidatedWithGroq({ systemInstruction: "sys", prompt: "p", responseJsonSchema, schema });

    expect(result.value).toBe("recovered");
    expect(groqCreate).toHaveBeenCalledTimes(2);
  });

  it("throws LLM_INVALID_RESPONSE when the repair attempt also fails", async () => {
    mockEnv.GROQ_API_KEY = "key";
    groqCreate.mockResolvedValue(groqResponse("still not json"));

    await expect(
      generateValidatedWithGroq({ systemInstruction: "sys", prompt: "p", responseJsonSchema, schema, maxRepairAttempts: 1 })
    ).rejects.toMatchObject({ code: "LLM_INVALID_RESPONSE" });
    expect(groqCreate).toHaveBeenCalledTimes(2);
  });

  it("throws LLM_INVALID_RESPONSE when a schema mismatch survives the repair attempt", async () => {
    mockEnv.GROQ_API_KEY = "key";
    groqCreate.mockResolvedValue(groqResponse('{"wrong":"shape"}'));

    await expect(
      generateValidatedWithGroq({ systemInstruction: "sys", prompt: "p", responseJsonSchema, schema, maxRepairAttempts: 1 })
    ).rejects.toMatchObject({ code: "LLM_INVALID_RESPONSE" });
  });

  it("maps a 429 to LLM_RATE_LIMITED", async () => {
    mockEnv.GROQ_API_KEY = "key";
    groqCreate.mockRejectedValue(Object.assign(new Error("rate limited"), { status: 429 }));

    await expect(
      generateValidatedWithGroq({ systemInstruction: "sys", prompt: "p", responseJsonSchema, schema, maxRepairAttempts: 0 })
    ).rejects.toMatchObject({ code: "LLM_RATE_LIMITED" });
  });

  it("maps a 5xx to LLM_UNAVAILABLE", async () => {
    mockEnv.GROQ_API_KEY = "key";
    groqCreate.mockRejectedValue(Object.assign(new Error("down"), { status: 503 }));

    await expect(
      generateValidatedWithGroq({ systemInstruction: "sys", prompt: "p", responseJsonSchema, schema, maxRepairAttempts: 0 })
    ).rejects.toMatchObject({ code: "LLM_UNAVAILABLE" });
  });

  it("maps a non-429 4xx to LLM_REQUEST_REJECTED", async () => {
    mockEnv.GROQ_API_KEY = "key";
    groqCreate.mockRejectedValue(Object.assign(new Error("bad request"), { status: 400 }));

    await expect(
      generateValidatedWithGroq({ systemInstruction: "sys", prompt: "p", responseJsonSchema, schema, maxRepairAttempts: 0 })
    ).rejects.toMatchObject({ code: "LLM_REQUEST_REJECTED" });
  });

  it("throws LLM_INVALID_RESPONSE when the response has no content", async () => {
    mockEnv.GROQ_API_KEY = "key";
    groqCreate.mockResolvedValue({ choices: [{ message: {} }] });

    await expect(
      generateValidatedWithGroq({ systemInstruction: "sys", prompt: "p", responseJsonSchema, schema, maxRepairAttempts: 0 })
    ).rejects.toMatchObject({ code: "LLM_INVALID_RESPONSE" });
  });
});
