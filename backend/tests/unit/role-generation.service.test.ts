import { describe, expect, it, vi } from "vitest";

const { generateValidated } = vi.hoisted(() => ({ generateValidated: vi.fn() }));
vi.mock("../../src/services/ai/gemini.client", () => ({ generateValidated }));

import { analyzeRole } from "../../src/services/generation/role-generation.service";
import { Requirement } from "../../src/types/kit.types";
import { CompanyResearchResult } from "../../src/types/research.types";

function fakeResearch(): CompanyResearchResult {
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
  };
}

describe("analyzeRole", () => {
  it("echoes the already-extracted requirements rather than inventing a second set", async () => {
    generateValidated.mockResolvedValueOnce({
      title: "Backend Engineer",
      seniority: "Not specified",
      responsibilities: ["Build APIs"],
    });

    const requirements: Requirement[] = [{ id: "r1", text: "5+ years with Node.js", kind: "technical", priority: "must" }];

    const role = await analyzeRole("some JD", requirements, fakeResearch());

    expect(role.requirements).toBe(requirements);
    expect(role.title).toBe("Backend Engineer");
  });
});
