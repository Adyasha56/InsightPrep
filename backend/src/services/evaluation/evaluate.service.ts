import { InvalidEvaluationInputError, loadEvaluationCases } from "./load-cases.service";
import { runBatchEvaluation } from "./batch-evaluation.service";
import { writeEvaluationOutput } from "./write-output.service";
import { EvaluationOutput } from "../../types/evaluation.types";

export { InvalidEvaluationInputError };

// The evaluator's top-level orchestration: read + validate the input file,
// run every case through the same application pipeline the product uses
// (case-pipeline.service.ts), then write the result file. Contains no
// generation/research/scheduling logic of its own.
export async function runEvaluation(inputPath: string, outputPath: string): Promise<EvaluationOutput> {
  const cases = await loadEvaluationCases(inputPath);
  const kits = await runBatchEvaluation(cases);

  const output: EvaluationOutput = {
    version: "1.0",
    generated_at: new Date().toISOString(),
    kits,
  };

  await writeEvaluationOutput(outputPath, output);
  return output;
}
