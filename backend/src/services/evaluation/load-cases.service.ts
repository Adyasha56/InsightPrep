import { readFile } from "fs/promises";
import { evaluationInputSchema } from "../../validators/evaluation.validator";
import { EvaluationCase } from "../../types/evaluation.types";

export class InvalidEvaluationInputError extends Error {}

export async function loadEvaluationCases(inputPath: string): Promise<EvaluationCase[]> {
  let raw: string;
  try {
    raw = await readFile(inputPath, "utf-8");
  } catch {
    throw new InvalidEvaluationInputError(`Could not read input file: ${inputPath}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new InvalidEvaluationInputError(`Input file is not valid JSON: ${inputPath}`);
  }

  const result = evaluationInputSchema.safeParse(parsed);
  if (!result.success) {
    throw new InvalidEvaluationInputError(
      `Invalid case input: ${JSON.stringify(result.error.flatten().fieldErrors)}`
    );
  }

  // Duplicate ids are rejected outright (rather than silently kept as
  // separate entries) — the same "fail fast on bad input" convention the
  // rest of the application uses at every zod-validated boundary, and it
  // avoids any ambiguity downstream about which of two same-id results in
  // kits.json a consumer should trust.
  const seenIds = new Set<string>();
  const duplicateIds = new Set<string>();
  result.data.forEach((evaluationCase) => {
    if (seenIds.has(evaluationCase.id)) {
      duplicateIds.add(evaluationCase.id);
    }
    seenIds.add(evaluationCase.id);
  });
  if (duplicateIds.size > 0) {
    throw new InvalidEvaluationInputError(`Duplicate case id(s): ${[...duplicateIds].join(", ")}`);
  }

  return result.data;
}
