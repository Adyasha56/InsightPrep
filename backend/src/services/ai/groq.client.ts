import Groq from "groq-sdk";
import { env } from "../../config/env";
import { AppError } from "../../utils/AppError";
import { ErrorCode } from "../../types/error-code.types";
import { GenerateValidatedOptions } from "./ai.types";

// Fallback provider only — used by gemini.client.ts's generateValidated when
// Gemini itself has already exhausted its own bounded retries with a
// retryable error (rate limit / outage). Never primary, never imported by
// generation services directly, so every prompt/schema keeps flowing
// through the exact same call site regardless of which provider actually
// answers it.

let cachedClient: Groq | null = null;

export function isGroqConfigured(): boolean {
  return Boolean(env.GROQ_API_KEY);
}

function getClient(): Groq {
  if (!env.GROQ_API_KEY) {
    throw new AppError(ErrorCode.LLM_NOT_CONFIGURED, "GROQ_API_KEY is not configured.", 503);
  }
  if (!cachedClient) {
    cachedClient = new Groq({ apiKey: env.GROQ_API_KEY });
  }
  return cachedClient;
}

function toProviderError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  const status = (error as { status?: unknown } | undefined)?.status;
  if (status === 429) {
    return new AppError(ErrorCode.LLM_RATE_LIMITED, "Groq rate limit exceeded.", 429);
  }
  if (typeof status === "number" && status >= 500) {
    return new AppError(ErrorCode.LLM_UNAVAILABLE, "Groq is temporarily unavailable.", 502);
  }
  if (typeof status === "number") {
    const message = error instanceof Error ? error.message : "Groq rejected the request.";
    return new AppError(ErrorCode.LLM_REQUEST_REJECTED, message, 502);
  }
  const message = error instanceof Error ? error.message : "Unknown Groq provider error.";
  return new AppError(ErrorCode.LLM_UNAVAILABLE, message, 502);
}

// Same fence-stripping tolerance as the Gemini client — Groq's JSON mode
// reliably omits markdown fences, but this guards against it anyway.
function extractJson(raw: string): unknown {
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenceMatch ? fenceMatch[1] : raw).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    throw new Error("Response was not valid JSON.");
  }
}

// Unlike Gemini, Groq's `response_format: json_object` mode only enforces
// "valid JSON," not a specific shape — Gemini gets the actual field names
// enforced server-side via `responseJsonSchema`, which is why none of this
// app's prompts spell the schema out in the instruction text itself. Groq
// has no equivalent, so the schema has to be appended to the system
// instruction here, or Groq has no way to know the required field names.
function withSchemaInstruction(systemInstruction: string, responseJsonSchema: Record<string, unknown>): string {
  return `${systemInstruction}\n\nRespond with a JSON object that strictly matches this JSON Schema:\n${JSON.stringify(responseJsonSchema)}`;
}

async function callGroqOnce(systemInstruction: string, prompt: string, responseJsonSchema: Record<string, unknown>): Promise<string> {
  const client = getClient();

  let text: string | null | undefined;
  try {
    const completion = await client.chat.completions.create({
      model: env.GROQ_MODEL,
      messages: [
        { role: "system", content: withSchemaInstruction(systemInstruction, responseJsonSchema) },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    });
    text = completion.choices[0]?.message?.content;
  } catch (error) {
    throw toProviderError(error);
  }

  if (!text) {
    throw new AppError(ErrorCode.LLM_INVALID_RESPONSE, "Groq returned an empty response.", 502);
  }
  return text;
}

// Deliberately no network-retry loop of its own (unlike Gemini's
// callWithRetry) — this only runs after Gemini has already spent its retry
// budget, so chaining a second provider's full retry loop on top would risk
// a very slow request for little benefit. It keeps the same bounded
// "repair" loop (one corrective re-ask on invalid JSON/schema) so a
// malformed response is still recoverable, just not a flaky network error.
export async function generateValidatedWithGroq<T>(options: GenerateValidatedOptions<T>): Promise<T> {
  const maxRepairAttempts = options.maxRepairAttempts ?? 1;
  let lastIssue = "";

  for (let repair = 0; repair <= maxRepairAttempts; repair += 1) {
    const prompt =
      repair === 0
        ? options.prompt
        : `${options.prompt}\n\nYour previous response was invalid: ${lastIssue}\nReturn corrected JSON that satisfies the schema exactly.`;

    const raw = await callGroqOnce(options.systemInstruction, prompt, options.responseJsonSchema);

    try {
      const parsedJson = extractJson(raw);
      const result = options.schema.safeParse(parsedJson);
      if (result.success) {
        return result.data;
      }
      lastIssue = JSON.stringify(result.error.flatten());
    } catch (error) {
      lastIssue = error instanceof Error ? error.message : "Invalid response.";
    }
  }

  throw new AppError(
    ErrorCode.LLM_INVALID_RESPONSE,
    "Groq response did not match the expected structure after retrying.",
    502,
    { issue: lastIssue }
  );
}
