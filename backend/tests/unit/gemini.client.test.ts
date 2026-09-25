import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const { generateContent } = vi.hoisted(() => ({ generateContent: vi.fn() }));

vi.mock("@google/genai", () => ({
  // A plain function (not an arrow function) so `new GoogleGenAI(...)` in
  // the client under test can actually construct it.
  GoogleGenAI: vi.fn().mockImplementation(function GoogleGenAI(this: { models: unknown }) {
    this.models = { generateContent };
  }),
}));

import { generateValidated } from "../../src/services/ai/gemini.client";

afterEach(() => {
  generateContent.mockReset();
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

  it("gives up after exhausting network retries on a persistent provider failure", async () => {
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
  });

  it("does not retry a non-transient error", async () => {
    const badRequestError = Object.assign(new Error("bad request"), { status: 400 });
    generateContent.mockRejectedValue(badRequestError);

    await expect(
      generateValidated({ systemInstruction: "sys", prompt: "p", responseJsonSchema, schema, maxRepairAttempts: 0 })
    ).rejects.toBeTruthy();
    expect(generateContent).toHaveBeenCalledTimes(1);
  });
});
