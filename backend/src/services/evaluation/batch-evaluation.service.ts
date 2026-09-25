import { runCasePipeline } from "./case-pipeline.service";
import { AppError } from "../../utils/AppError";
import { EvaluationCase, EvaluationCaseResult } from "../../types/evaluation.types";

// Small and bounded on purpose: Gemini is a free-tier, rate-limited
// dependency (RULES.md section 14), and retries already happen inside the
// existing Gemini client (Phase 5) — running many cases at once would just
// multiply how often those retries get triggered across cases, not make
// the batch meaningfully faster. Not exposed as a CLI flag; the required
// surface is exactly --input/--output.
const DEFAULT_CONCURRENCY = 2;

function describeError(error: unknown): string {
  // Deliberately just code+message — never error.details (which can carry
  // structured validation payloads) or the raw object, so nothing from the
  // job description, research content, or provider internals can leak into
  // the output file.
  if (error instanceof AppError) {
    return `${error.code}: ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error during kit generation.";
}

async function processCase(evaluationCase: EvaluationCase): Promise<EvaluationCaseResult> {
  try {
    const kit = await runCasePipeline({
      jobDescription: evaluationCase.jd,
      companyUrl: evaluationCase.company_url,
      daysAvailable: evaluationCase.days,
    });
    return { id: evaluationCase.id, status: "ok", kit };
  } catch (error) {
    // A per-case try/catch boundary is the whole mechanism that keeps one
    // bad case from aborting the batch (RULES.md section 10) — there is no
    // outer catch around the batch as a whole.
    return { id: evaluationCase.id, status: "failed", error: describeError(error) };
  }
}

// Bounded-concurrency worker pool: at most `concurrency` cases run at once,
// each case still resolves into `results[originalIndex]`, so output order
// always matches input order regardless of which case happens to finish
// first.
export async function runBatchEvaluation(
  cases: EvaluationCase[],
  concurrency: number = DEFAULT_CONCURRENCY
): Promise<EvaluationCaseResult[]> {
  const results: EvaluationCaseResult[] = new Array(cases.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < cases.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await processCase(cases[currentIndex]);
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, cases.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}
