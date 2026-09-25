import { afterEach, describe, expect, it, vi } from "vitest";
import { createRobotsCache, getRobotsRules, isPathAllowed } from "../../src/services/retrieval/robots.service";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("robots.txt handling", () => {
  it("disallows paths matched by the wildcard user-agent group", async () => {
    const robotsTxt = ["User-agent: *", "Disallow: /private", "Allow: /private/public-notice"].join("\n");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(robotsTxt, { status: 200, headers: { "content-type": "text/plain" } }))
    );

    const rules = await getRobotsRules("https://example.com", createRobotsCache());

    expect(isPathAllowed(rules, "/private/salary-data")).toBe(false);
    expect(isPathAllowed(rules, "/private/public-notice")).toBe(true);
    expect(isPathAllowed(rules, "/careers")).toBe(true);
  });

  it("allows everything when robots.txt cannot be retrieved", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Not found", { status: 404 })));

    const rules = await getRobotsRules("https://example.com", createRobotsCache());

    expect(isPathAllowed(rules, "/anything")).toBe(true);
  });

  it("fetches robots.txt at most once per origin per crawl", async () => {
    const mockFetch = vi.fn(
      async () => new Response("User-agent: *\nDisallow:", { status: 200, headers: { "content-type": "text/plain" } })
    );
    vi.stubGlobal("fetch", mockFetch);

    const cache = createRobotsCache();
    await getRobotsRules("https://example.com", cache);
    await getRobotsRules("https://example.com", cache);

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
