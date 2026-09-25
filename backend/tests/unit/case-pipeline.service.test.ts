import { describe, expect, it, vi } from "vitest";

const { researchCompany, generateDraftKit } = vi.hoisted(() => ({
  researchCompany: vi.fn(),
  generateDraftKit: vi.fn(),
}));
vi.mock("../../src/services/research/company-research.service", () => ({ researchCompany }));
vi.mock("../../src/services/generation/kit-generation.service", () => ({ generateDraftKit }));

import { runCasePipeline } from "../../src/services/evaluation/case-pipeline.service";
import { env } from "../../src/config/env";

describe("runCasePipeline", () => {
  it("delegates to researchCompany then generateDraftKit — the same two functions the HTTP controller uses", async () => {
    const fakeResearch = { companyUrl: "https://example.com", pages: [] };
    researchCompany.mockResolvedValueOnce(fakeResearch);
    generateDraftKit.mockResolvedValueOnce({ questions: [] });

    const result = await runCasePipeline({
      jobDescription: "JD",
      companyUrl: "https://example.com",
      daysAvailable: 5,
    });

    expect(researchCompany).toHaveBeenCalledTimes(1);
    expect(generateDraftKit).toHaveBeenCalledTimes(1);
    expect(generateDraftKit).toHaveBeenCalledWith(
      expect.objectContaining({
        jobDescription: "JD",
        companyUrl: "https://example.com",
        daysAvailable: 5,
        research: fakeResearch,
      })
    );
    expect(result).toEqual({ questions: [] });
  });

  it("passes the same ALLOW_LOCAL_RESEARCH_TARGETS flag the application reads from the environment", async () => {
    researchCompany.mockResolvedValueOnce({ pages: [] });
    generateDraftKit.mockResolvedValueOnce({});

    await runCasePipeline({ jobDescription: "JD", companyUrl: "http://mock-company.test", daysAvailable: 3 });

    expect(researchCompany).toHaveBeenCalledWith(
      "http://mock-company.test",
      expect.objectContaining({ allowLocalTargets: env.ALLOW_LOCAL_RESEARCH_TARGETS })
    );
  });
});
