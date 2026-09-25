import { env } from "../../config/env";
import { sleep } from "../../utils/sleep.util";
import { FetchFailure, FetchFailureReason, FetchResult } from "../../types/research.types";

const USER_AGENT = "InsightPrepResearchBot/1.0 (interview-prep research crawler)";

export interface FetchOptions {
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxRetries?: number;
  acceptedContentTypes?: string[];
}

const DEFAULT_ACCEPTED_CONTENT_TYPES = ["text/html", "application/xhtml+xml"];

function isRetryable(failure: FetchFailure): boolean {
  if (failure.reason === "TIMEOUT" || failure.reason === "CONNECTION_ERROR") {
    return true;
  }
  if (failure.reason === "HTTP_ERROR" && failure.status !== undefined) {
    return failure.status === 429 || failure.status >= 500;
  }
  return false;
}

// Fetches a single URL with a byte cap, content-type gate, and bounded
// exponential-backoff retries. Never throws — network/HTTP problems are
// returned as a structured FetchFailure so a crawl can skip a bad page
// instead of aborting the whole research request.
export async function fetchUrl(url: string, options: FetchOptions = {}): Promise<FetchResult> {
  const maxRetries = options.maxRetries ?? env.CRAWLER_MAX_RETRIES;

  let attempt = 0;
  let lastResult: FetchResult = await performFetch(url, options);

  while (!lastResult.ok && isRetryable(lastResult) && attempt < maxRetries) {
    attempt += 1;
    await sleep(2 ** attempt * 200);
    lastResult = await performFetch(url, options);
  }

  return lastResult;
}

async function performFetch(url: string, options: FetchOptions): Promise<FetchResult> {
  const timeoutMs = options.timeoutMs ?? env.CRAWLER_TIMEOUT_MS;
  const maxResponseBytes = options.maxResponseBytes ?? env.CRAWLER_MAX_RESPONSE_BYTES;
  const acceptedContentTypes = options.acceptedContentTypes ?? DEFAULT_ACCEPTED_CONTENT_TYPES;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!response.ok) {
      return failure(url, "HTTP_ERROR", `Request failed with status ${response.status}.`, response.status);
    }

    const contentType = response.headers.get("content-type") ?? "";
    const isAcceptedType = acceptedContentTypes.some((type) => contentType.toLowerCase().includes(type));
    if (!isAcceptedType) {
      return failure(url, "UNSUPPORTED_CONTENT_TYPE", `Unsupported content type: ${contentType || "unknown"}.`);
    }

    const body = await readBodyWithLimit(response, maxResponseBytes);
    if (body === null) {
      return failure(url, "RESPONSE_TOO_LARGE", `Response exceeded ${maxResponseBytes} bytes.`);
    }

    return {
      ok: true,
      requestedUrl: url,
      finalUrl: response.url || url,
      status: response.status,
      contentType,
      html: body,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return failure(url, "TIMEOUT", `Request timed out after ${timeoutMs}ms.`);
    }
    const message = error instanceof Error ? error.message : "Unknown network error.";
    return failure(url, "CONNECTION_ERROR", message);
  } finally {
    clearTimeout(timeout);
  }
}

// Reads the response as a stream and aborts once the byte cap is exceeded,
// instead of buffering an unbounded body into memory first.
async function readBodyWithLimit(response: Response, maxBytes: number): Promise<string | null> {
  if (!response.body) {
    return await response.text();
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf-8");
}

function failure(url: string, reason: FetchFailureReason, message: string, status?: number): FetchFailure {
  return { ok: false, requestedUrl: url, reason, message, status };
}
