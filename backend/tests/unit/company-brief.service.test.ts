import { describe, expect, it, vi } from "vitest";

const { generateValidated } = vi.hoisted(() => ({ generateValidated: vi.fn() }));
vi.mock("../../src/services/ai/gemini.client", () => ({ generateValidated }));

import { generateCompanyBrief } from "../../src/services/generation/company-brief.service";
import { CompanyResearchResult } from "../../src/types/research.types";

function fakeResearch(overrides: Partial<CompanyResearchResult> = {}): CompanyResearchResult {
  return {
    companyUrl: "https://example.com",
    finalUrl: "https://example.com",
    status: "success",
    pages: [],
    pagesUsed: 0,
    companyPages: [],
    hiringPages: [],
    failures: [],
    warnings: [],
    fetchedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("generateCompanyBrief", () => {
  it("sets sources from the actual research pages, never from the model", async () => {
    generateValidated.mockResolvedValueOnce({
      summary: "Example Co builds developer tools.",
      what_they_do: "Developer tooling.",
      // Even if the model tried to slip in an extra "source", the service
      // schema doesn't accept one, and sources are set below regardless.
    });

    const research = fakeResearch({
      pages: [
        {
          url: "https://example.com/",
          title: "Example Co",
          status: 200,
          contentType: "text/html",
          text: "We build developer tools.",
          links: [],
          fetchedAt: new Date().toISOString(),
          sourceType: "homepage",
        },
        {
          url: "https://example.com/about",
          title: "About",
          status: 200,
          contentType: "text/html",
          text: "Founded in 2020.",
          links: [],
          fetchedAt: new Date().toISOString(),
          sourceType: "about",
        },
      ],
    });

    const brief = await generateCompanyBrief("https://example.com", research);

    expect(brief.sources).toEqual(["https://example.com/", "https://example.com/about"]);
    expect(brief.summary).toBe("Example Co builds developer tools.");
  });

  it("returns an honest limited brief without calling Gemini when research found nothing", async () => {
    const research = fakeResearch({ pages: [], status: "failed" });

    const brief = await generateCompanyBrief("https://example.com", research);

    expect(brief.sources).toEqual([]);
    expect(brief.summary.toLowerCase()).toContain("no usable company information");
    expect(generateValidated).not.toHaveBeenCalled();
  });
});
