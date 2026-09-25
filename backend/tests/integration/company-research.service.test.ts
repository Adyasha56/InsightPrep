import { afterEach, describe, expect, it, vi } from "vitest";
import { researchCompany } from "../../src/services/research/company-research.service";

interface MockPage {
  status: number;
  html?: string;
  contentType?: string;
}

function stubSite(pages: Record<string, MockPage>): void {
  const mockFetch = vi.fn(async (input: string | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const path = new URL(url).pathname;

    if (path === "/robots.txt") {
      return new Response("Not found", { status: 404 });
    }

    const page = pages[path];
    if (!page) {
      return new Response("Not found", { status: 404 });
    }

    return new Response(page.html ?? "<html><body>ok</body></html>", {
      status: page.status,
      headers: { "content-type": page.contentType ?? "text/html" },
    });
  });

  vi.stubGlobal("fetch", mockFetch);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const OPTS = { allowLocalTargets: true };

describe("researchCompany", () => {
  it("keeps successful pages when one page fails, reporting a partial status", async () => {
    stubSite({
      "/": {
        status: 200,
        html: `<html><head><title>Mock Co</title></head><body>
          <a href="/careers">Careers</a>
          <a href="/broken">Broken</a>
        </body></html>`,
      },
      "/careers": { status: 200, html: "<html><body><h1>Careers</h1><p>We are hiring.</p></body></html>" },
      "/broken": { status: 503 },
    });

    const result = await researchCompany("http://mock-company.test", OPTS);

    expect(result.status).toBe("partial");
    expect(result.pages.map((p) => p.url)).toEqual(
      expect.arrayContaining(["http://mock-company.test/", "http://mock-company.test/careers"])
    );
    expect(result.hiringPages).toHaveLength(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].url).toBe("http://mock-company.test/broken");
    expect(result.failures[0].reason).toBe("HTTP_ERROR");
  });

  it("respects the configured page budget instead of crawling every discovered link", async () => {
    const links = Array.from({ length: 10 }, (_, i) => `<a href="/page${i}">Page ${i}</a>`).join("\n");
    const pages: Record<string, MockPage> = {
      "/": { status: 200, html: `<html><body>${links}</body></html>` },
    };
    for (let i = 0; i < 10; i += 1) {
      pages[`/page${i}`] = { status: 200, html: `<html><body><p>Content ${i}</p></body></html>` };
    }
    stubSite(pages);

    const result = await researchCompany("http://mock-company.test", OPTS);

    // CRAWLER_MAX_PAGES is 4 in the test environment (vitest.config.mts).
    expect(result.pagesUsed).toBe(4);
    expect(result.pages).toHaveLength(4);
  });

  it("reports missing hiring information honestly instead of fabricating a careers page", async () => {
    stubSite({
      "/": {
        status: 200,
        html: `<html><body><a href="/about">About</a></body></html>`,
      },
      "/about": { status: 200, html: "<html><body><h1>About</h1><p>We build things.</p></body></html>" },
    });

    const result = await researchCompany("http://mock-company.test", OPTS);

    expect(result.status).toBe("success");
    expect(result.hiringPages).toHaveLength(0);
    expect(result.warnings).toEqual(expect.arrayContaining([expect.stringContaining("hiring")]));
  });

  it("returns a failed status when the homepage itself cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Server error", { status: 500 })));

    const result = await researchCompany("http://mock-company.test", OPTS);

    expect(result.status).toBe("failed");
    expect(result.pages).toHaveLength(0);
    expect(result.failures).toHaveLength(1);
  });
});
