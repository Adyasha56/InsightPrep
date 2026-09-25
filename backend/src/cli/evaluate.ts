import { CliArgumentError, parseEvaluateArgs } from "./parse-args";
import { InvalidEvaluationInputError, runEvaluation } from "../services/evaluation/evaluate.service";

async function main(): Promise<void> {
  let args;
  try {
    args = parseEvaluateArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof CliArgumentError ? error.message : "Invalid arguments.");
    console.error("Usage: npm run evaluate -- --input <path> --output <path>");
    process.exitCode = 1;
    return;
  }

  try {
    const output = await runEvaluation(args.input, args.output);
    const failedCount = output.kits.filter((kit) => kit.status === "failed").length;
    console.log(`Evaluated ${output.kits.length} case(s): ${output.kits.length - failedCount} ok, ${failedCount} failed.`);
    console.log(`Output written to ${args.output}`);
  } catch (error) {
    if (error instanceof InvalidEvaluationInputError) {
      console.error(`Invalid input: ${error.message}`);
    } else {
      console.error(`Evaluation failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
    process.exitCode = 1;
  }
}

main();
