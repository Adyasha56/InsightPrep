import { mkdir, rename, writeFile } from "fs/promises";
import path from "path";
import { EvaluationOutput } from "../../types/evaluation.types";

// Writes to a temp file in the same directory, then renames it into place —
// rename is atomic on the same filesystem, so a crash mid-write never
// leaves a partially-written/corrupt file at the requested output path
// (RULES.md section 13).
export async function writeEvaluationOutput(outputPath: string, output: EvaluationOutput): Promise<void> {
  const dir = path.dirname(outputPath);
  await mkdir(dir, { recursive: true });

  const tempPath = path.join(dir, `.${path.basename(outputPath)}.tmp-${process.pid}-${Date.now()}`);
  const serialized = JSON.stringify(output, null, 2);

  await writeFile(tempPath, serialized, "utf-8");
  await rename(tempPath, outputPath);
}
