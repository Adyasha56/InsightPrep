import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";

const { generateValidated } = vi.hoisted(() => ({ generateValidated: vi.fn() }));
vi.mock("../../src/services/ai/gemini.client", () => ({ generateValidated }));

import { runEvaluation } from "../../src/services/evaluation/evaluate.service";
import { AppError } from "../../src/utils/AppError";
import { ErrorCode } from "../../src/types/error-code.types";

const FIXTURE_PATH = path.join(__dirname, "..", "fixtures", "cases.fixture.json");

let dir: string | null = null;

afterEach(() => {
  vi.unstubAllGlobals();
  generateValidated.mockReset();
  if (dir) {
    rmSync(dir, { recursive: true, force: true });
    dir = null;
  }
});

// A single content-based mock (rather than a call-order queue) so it stays
// correct regardless of how the batch's bounded concurrency interleaves
// calls from different cases — each case's job description/prompt content
// deterministically decides the response, not call order.
function stubGemini(): void {
  generateValidated.mockImplementation(async (options: { systemInstruction: string; prompt: string }) => {
    const { systemInstruction, prompt } = options;

    if (prompt.includes("FAIL_MARKER")) {
      throw new AppError(ErrorCode.LLM_UNAVAILABLE, "Simulated persistent Gemini failure.", 502);
    }
    if (systemInstruction.includes("extract hiring requirements")) {
      return { requirements: [{ text: "5+ years with React", kind: "technical", priority: "must" }] };
    }
    if (systemInstruction.includes("company brief")) {
      return { summary: "A company.", what_they_do: "Builds things." };
    }
    if (systemInstruction.includes("role breakdown")) {
      return { title: "Engineer", seniority: "Mid", responsibilities: ["Build features"] };
    }
    if (systemInstruction.includes("technical interview questions")) {
      return {
        questions: [{ prompt: "Explain React hooks.", answer_outline: "...", difficulty: 2, requirement_ids: ["r1"] }],
      };
    }
    if (
      systemInstruction.includes("behavioural interview questions") ||
      systemInstruction.includes("system-design interview questions") ||
      systemInstruction.includes("company-fit interview questions")
    ) {
      return { questions: [] };
    }
    if (systemInstruction.includes("study flashcards")) {
      return { flashcards: [] };
    }

    throw new Error(`Unexpected prompt in test mock: ${systemInstruction.slice(0, 80)}`);
  });
}

function stubResearch(): void {
  const mockFetch = vi.fn(async (input: string | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const pathname = new URL(url).pathname;

    if (pathname === "/robots.txt") {
      return new Response("Not found", { status: 404 });
    }
    return new Response("<html><head><title>Mock Co</title></head><body><p>We build things.</p></body></html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    });
  });
  vi.stubGlobal("fetch", mockFetch);
}

describe("runEvaluation (end-to-end, mocked Gemini + research)", () => {
  it("processes the fixture batch: one normal case, one with different days, one intentionally failing", async () => {
    stubGemini();
    stubResearch();

    dir = mkdtempSync(path.join(tmpdir(), "insightprep-eval-e2e-"));
    const outputPath = path.join(dir, "kits.json");

    const output = await runEvaluation(FIXTURE_PATH, outputPath);

    // Output file structure (Appendix B).
    expect(output.version).toBe("1.0");
    expect(new Date(output.generated_at).toString()).not.toBe("Invalid Date");
    expect(output.kits).toHaveLength(3);

    // Case order preserved, and every input case has exactly one result.
    expect(output.kits.map((k) => k.id)).toEqual(["case-normal", "case-different-days", "case-failing"]);

    const [normalCase, differentDaysCase, failingCase] = output.kits;

    expect(normalCase.status).toBe("ok");
    if (normalCase.status === "ok") {
      expect(normalCase.kit.schedule.days_available).toBe(5);
      expect(normalCase.kit.schedule.days).toHaveLength(5);
      expect(normalCase.kit.role.requirements).toHaveLength(1);
    }

    // Per-case days value propagates into schedule.days_available.
    expect(differentDaysCase.status).toBe("ok");
    if (differentDaysCase.status === "ok") {
      expect(differentDaysCase.kit.schedule.days_available).toBe(10);
      expect(differentDaysCase.kit.schedule.days).toHaveLength(10);
    }

    // Processing continued past the failing case — it doesn't stop the batch.
    expect(failingCase.status).toBe("failed");
    if (failingCase.status === "failed") {
      expect(failingCase.error).toContain("LLM_UNAVAILABLE");
      expect(failingCase).not.toHaveProperty("kit");
    }

    // The written file matches the returned object exactly.
    const written = JSON.parse(readFileSync(outputPath, "utf-8"));
    expect(written).toEqual(output);
  });

  it("still writes a valid output file when every case fails", async () => {
    generateValidated.mockRejectedValue(new AppError(ErrorCode.LLM_UNAVAILABLE, "Down.", 502));
    stubResearch();

    dir = mkdtempSync(path.join(tmpdir(), "insightprep-eval-e2e-"));
    const outputPath = path.join(dir, "kits.json");

    const output = await runEvaluation(FIXTURE_PATH, outputPath);

    expect(output.version).toBe("1.0");
    expect(output.kits).toHaveLength(3);
    expect(output.kits.every((k) => k.status === "failed")).toBe(true);

    const written = JSON.parse(readFileSync(outputPath, "utf-8"));
    expect(written.kits).toHaveLength(3);
  });
});
