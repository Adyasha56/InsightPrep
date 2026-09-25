import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { writeEvaluationOutput } from "../../src/services/evaluation/write-output.service";
import { EvaluationOutput } from "../../src/types/evaluation.types";

let dir: string | null = null;

afterEach(() => {
  if (dir) {
    rmSync(dir, { recursive: true, force: true });
    dir = null;
  }
});

const sampleOutput: EvaluationOutput = {
  version: "1.0",
  generated_at: new Date().toISOString(),
  kits: [{ id: "case-1", status: "failed", error: "example" }],
};

describe("writeEvaluationOutput", () => {
  it("writes valid, readable JSON at the requested path", async () => {
    dir = mkdtempSync(path.join(tmpdir(), "insightprep-eval-out-"));
    const outputPath = path.join(dir, "kits.json");

    await writeEvaluationOutput(outputPath, sampleOutput);

    expect(existsSync(outputPath)).toBe(true);
    const parsed = JSON.parse(readFileSync(outputPath, "utf-8"));
    expect(parsed).toEqual(sampleOutput);
  });

  it("creates missing parent directories", async () => {
    dir = mkdtempSync(path.join(tmpdir(), "insightprep-eval-out-"));
    const outputPath = path.join(dir, "nested", "deeper", "kits.json");

    await writeEvaluationOutput(outputPath, sampleOutput);

    expect(existsSync(outputPath)).toBe(true);
  });

  it("leaves no leftover temp file after a successful write", async () => {
    dir = mkdtempSync(path.join(tmpdir(), "insightprep-eval-out-"));
    const outputPath = path.join(dir, "kits.json");

    await writeEvaluationOutput(outputPath, sampleOutput);

    const { readdirSync } = await import("fs");
    const files = readdirSync(dir);
    expect(files).toEqual(["kits.json"]);
  });
});
