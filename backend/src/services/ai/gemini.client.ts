import { GoogleGenAI } from "@google/genai";
import { env } from "../../config/env";
import { sleep } from "../../utils/sleep.util";
import { AppError } from "../../utils/AppError";
import { ErrorCode } from "../../types/error-code.types";
import { GenerateValidatedOptions } from "./ai.types";

let cachedClient: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!env.GEMINI_API_KEY) {
    throw new AppError(ErrorCode.LLM_NOT_CONFIGURED, "GEMINI_API_KEY is not configured.", 503);
  }
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  }
  return cachedClient;
}

function extractStatus(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | undefined)?.status;
  return typeof status === "number" ? status : undefined;
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function toProviderError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  const status = extractStatus(error);
  if (status === 429) {
    return new AppError(ErrorCode.LLM_RATE_LIMITED, "Gemini rate limit exceeded.", 429);
  }
  if (isTimeoutError(error)) {
    return new AppError(ErrorCode.LLM_UNAVAILABLE, "Gemini request timed out.", 504);
  }
  if (typeof status === "number" && status >= 500) {
    return new AppError(ErrorCode.LLM_UNAVAILABLE, "Gemini is temporarily unavailable.", 502);
  }
  if (typeof status === "number") {
    // A non-429 4xx (bad request, permission denied, ...) is a permanent
    // rejection of this specific request — retrying it would just fail the
    // same way again, unlike a rate limit or outage.
    const message = error instanceof Error ? error.message : "Gemini rejected the request.";
    return new AppError(ErrorCode.LLM_REQUEST_REJECTED, message, 502);
  }
  const message = error instanceof Error ? error.message : "Unknown Gemini provider error.";
  return new AppError(ErrorCode.LLM_UNAVAILABLE, message, 502);
}

function isRetryableProviderError(error: AppError): boolean {
  return error.code === ErrorCode.LLM_RATE_LIMITED || error.code === ErrorCode.LLM_UNAVAILABLE;
}

async function callGeminiOnce(
  systemInstruction: string,
  prompt: string,
  responseJsonSchema: Record<string, unknown>
): Promise<string> {
  const ai = getClient();

  let response;
  try {
    response = await ai.models.generateContent({
      model: env.GEMINI_MODEL,
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseJsonSchema,
        httpOptions: { timeout: env.GEMINI_TIMEOUT_MS },
      },
    });
  } catch (error) {
    throw toProviderError(error);
  }

  const text = response.text;
  if (!text) {
    throw new AppError(ErrorCode.LLM_INVALID_RESPONSE, "Gemini returned an empty response.", 502);
  }
  return text;
}

// Network-level retry: transient provider failures only (rate limit,
// timeout, 5xx). Bounded exponential backoff, never unbounded.
async function callWithRetry(
  systemInstruction: string,
  prompt: string,
  responseJsonSchema: Record<string, unknown>,
  maxRetries: number
): Promise<string> {
  let attempt = 0;
  while (true) {
    try {
      return await callGeminiOnce(systemInstruction, prompt, responseJsonSchema);
    } catch (error) {
      const providerError = error instanceof AppError ? error : toProviderError(error);
      if (!isRetryableProviderError(providerError) || attempt >= maxRetries) {
        throw providerError;
      }
      attempt += 1;
      await sleep(2 ** attempt * 500);
    }
  }
}

// Strips a markdown code fence if the model wrapped its JSON in one, then
// parses. Gemini responses with responseMimeType "application/json" usually
// omit fences, but this guards against the model doing it anyway.
function extractJson(raw: string): unknown {
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenceMatch ? fenceMatch[1] : raw).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    throw new Error("Response was not valid JSON.");
  }
}

// Generates content and validates it against `schema`. If the shape is
// invalid (bad JSON or a zod mismatch, including custom reference-integrity
// checks), asks Gemini once more with a corrective note before giving up —
// a small, bounded "repair" loop separate from (and on top of) the network
// retry above, so a flaky provider error and a malformed response can't
// multiply into an unbounded number of calls (RULES.md section 30).
export async function generateValidated<T>(options: GenerateValidatedOptions<T>): Promise<T> {
  const maxNetworkRetries = options.maxNetworkRetries ?? env.GEMINI_MAX_RETRIES;
  const maxRepairAttempts = options.maxRepairAttempts ?? 1;

  let lastIssue = "";

  for (let repair = 0; repair <= maxRepairAttempts; repair += 1) {
    const prompt =
      repair === 0
        ? options.prompt
        : `${options.prompt}\n\nYour previous response was invalid: ${lastIssue}\nReturn corrected JSON that satisfies the schema exactly.`;

    const raw = await callWithRetry(options.systemInstruction, prompt, options.responseJsonSchema, maxNetworkRetries);

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
    "Gemini response did not match the expected structure after retrying.",
    502,
    { issue: lastIssue }
  );
}
