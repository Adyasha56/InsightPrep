import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchUrl } from "../../src/services/retrieval/http-client.service";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchUrl", () => {
  it("returns an HTTP_ERROR for a 404 and does not retry a non-retryable status", async () => {
    const mockFetch = vi.fn(async () => new Response("Not found", { status: 404 }));
    vi.stubGlobal("fetch", mockFetch);

    const result = await fetchUrl("https://example.com/missing");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("HTTP_ERROR");
      expect(result.status).toBe(404);
    }
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("retries a 429 and succeeds on the following attempt", async () => {
    let calls = 0;
    const mockFetch = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        return new Response("Too many requests", { status: 429 });
      }
      return new Response("<html><body>ok</body></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await fetchUrl("https://example.com/", { maxRetries: 2 });

    expect(result.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("gives up after the configured retry limit on repeated 5xx failures", async () => {
    const mockFetch = vi.fn(async () => new Response("Server error", { status: 503 }));
    vi.stubGlobal("fetch", mockFetch);

    const result = await fetchUrl("https://example.com/", { maxRetries: 1 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("HTTP_ERROR");
      expect(result.status).toBe(503);
    }
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("reports a TIMEOUT failure when the request exceeds the timeout", async () => {
    const mockFetch = vi.fn((_url: string, init?: { signal?: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("The operation was aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await fetchUrl("https://example.com/slow", { timeoutMs: 50, maxRetries: 0 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("TIMEOUT");
    }
  });

  it("rejects an unsupported content type instead of returning HTML", async () => {
    const mockFetch = vi.fn(
      async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } })
    );
    vi.stubGlobal("fetch", mockFetch);

    const result = await fetchUrl("https://example.com/data.json");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("UNSUPPORTED_CONTENT_TYPE");
    }
  });
});
