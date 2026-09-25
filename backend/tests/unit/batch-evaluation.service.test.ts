import { describe, expect, it, vi } from "vitest";

const { runCasePipeline } = vi.hoisted(() => ({ runCasePipeline: vi.fn() }));
vi.mock("../../src/services/evaluation/case-pipeline.service", () => ({ runCasePipeline }));

import { runBatchEvaluation } from "../../src/services/evaluation/batch-evaluation.service";
import { EvaluationCase } from "../../src/types/evaluation.types";
import { AppError } from "../../src/utils/AppError";
import { ErrorCode } from "../../src/types/error-code.types";

function fakeCase(id: string, days = 5): EvaluationCase {
  return { id, jd: `JD for ${id}`, company_url: "https://example.com", days };
}

function fakeKit(overrides: Record<string, unknown> = {}) {
  return {
    source: { job_description: "JD", company_url: "https://example.com", days_available: 5 },
    company_brief: { summary: "s", what_they_do: "d", sources: [] },
    role: { title: "t", seniority: "s", responsibilities: [], requirements: [] },
    questions: [],
    flashcards: [],
    schedule: { days_available: 5, days: [] },
    coverage: { uncovered_requirement_ids: [], passes: 1 },
    ...overrides,
  };
}

describe("runBatchEvaluation", () => {
  it("processes a single case successfully", async () => {
    runCasePipeline.mockResolvedValueOnce(fakeKit());

    const results = await runBatchEvaluation([fakeCase("case-1")]);

    expect(results).toEqual([{ id: "case-1", status: "ok", kit: fakeKit() }]);
  });

  it("preserves input case order in the output regardless of completion timing", async () => {
    // case-1 resolves slower than case-2/case-3 to prove ordering isn't
    // determined by completion time.
    runCasePipeline
      .mockImplementationOnce(() => new Promise((resolve) => setTimeout(() => resolve(fakeKit()), 30)))
      .mockResolvedValueOnce(fakeKit())
      .mockResolvedValueOnce(fakeKit());

    const results = await runBatchEvaluation([fakeCase("case-1"), fakeCase("case-2"), fakeCase("case-3")], 3);

    expect(results.map((r) => r.id)).toEqual(["case-1", "case-2", "case-3"]);
  });

  it("passes each case's own days value through to the pipeline", async () => {
    runCasePipeline.mockResolvedValue(fakeKit());

    await runBatchEvaluation([fakeCase("case-1", 3), fakeCase("case-2", 21)]);

    expect(runCasePipeline).toHaveBeenNthCalledWith(1, expect.objectContaining({ daysAvailable: 3 }));
    expect(runCasePipeline).toHaveBeenNthCalledWith(2, expect.objectContaining({ daysAvailable: 21 }));
  });

  it("continues processing later cases after an earlier one fails", async () => {
    runCasePipeline
      .mockResolvedValueOnce(fakeKit())
      .mockRejectedValueOnce(new AppError(ErrorCode.LLM_UNAVAILABLE, "Gemini is down.", 502))
      .mockResolvedValueOnce(fakeKit());

    const results = await runBatchEvaluation([fakeCase("case-1"), fakeCase("case-2"), fakeCase("case-3")], 1);

    expect(results.map((r) => r.status)).toEqual(["ok", "failed", "ok"]);
  });

  it("produces a failed result with a useful message for every case, and a valid array, when all cases fail", async () => {
    runCasePipeline.mockRejectedValue(new Error("boom"));

    const results = await runBatchEvaluation([fakeCase("case-1"), fakeCase("case-2")]);

    expect(results).toHaveLength(2);
    results.forEach((result) => {
      expect(result.status).toBe("failed");
      expect((result as { error: string }).error).toContain("boom");
    });
  });

  it("includes an AppError's code in the failure message without leaking internal details", async () => {
    runCasePipeline.mockRejectedValueOnce(
      new AppError(ErrorCode.INVALID_KIT, "The generated kit failed validation.", 502, { secret: "should-not-appear" })
    );

    const results = await runBatchEvaluation([fakeCase("case-1")]);

    const result = results[0] as { status: string; error: string };
    expect(result.error).toContain("INVALID_KIT");
    expect(result.error).not.toContain("should-not-appear");
  });

  it("never runs more than the configured number of cases concurrently", async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    runCasePipeline.mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 10));
      inFlight -= 1;
      return fakeKit();
    });

    const cases = Array.from({ length: 6 }, (_, i) => fakeCase(`case-${i + 1}`));
    await runBatchEvaluation(cases, 2);

    expect(maxInFlight).toBeLessThanOrEqual(2);
  });

  it("does not call the pipeline directly for content generation — it only delegates to runCasePipeline", async () => {
    runCasePipeline.mockResolvedValueOnce(fakeKit());
    await runBatchEvaluation([fakeCase("case-1")]);

    // The only way this test's mock kit could appear in the result is if
    // runBatchEvaluation went through runCasePipeline (the same function
    // the HTTP kit controller uses) — there is no separate code path.
    expect(runCasePipeline).toHaveBeenCalledTimes(1);
  });
});
