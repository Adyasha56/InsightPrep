import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { InvalidEvaluationInputError, loadEvaluationCases } from "../../src/services/evaluation/load-cases.service";

let dir: string | null = null;

function writeFixture(name: string, content: string): string {
  dir = dir ?? mkdtempSync(path.join(tmpdir(), "insightprep-eval-"));
  const filePath = path.join(dir, name);
  writeFileSync(filePath, content, "utf-8");
  return filePath;
}

afterEach(() => {
  if (dir) {
    rmSync(dir, { recursive: true, force: true });
    dir = null;
  }
});

describe("loadEvaluationCases", () => {
  it("loads a valid single-case file", async () => {
    const filePath = writeFixture(
      "valid.json",
      JSON.stringify([{ id: "case-1", jd: "JD text", company_url: "https://example.com", days: 5 }])
    );

    const cases = await loadEvaluationCases(filePath);
    expect(cases).toEqual([{ id: "case-1", jd: "JD text", company_url: "https://example.com", days: 5 }]);
  });

  it("loads multiple cases and preserves order", async () => {
    const filePath = writeFixture(
      "multi.json",
      JSON.stringify([
        { id: "case-a", jd: "A", company_url: "https://a.example.com", days: 1 },
        { id: "case-b", jd: "B", company_url: "https://b.example.com", days: 10 },
      ])
    );

    const cases = await loadEvaluationCases(filePath);
    expect(cases.map((c) => c.id)).toEqual(["case-a", "case-b"]);
  });

  it("rejects a missing/unreadable file", async () => {
    await expect(loadEvaluationCases("/does/not/exist.json")).rejects.toThrow(InvalidEvaluationInputError);
  });

  it("rejects invalid JSON", async () => {
    const filePath = writeFixture("broken.json", "{ not valid json");
    await expect(loadEvaluationCases(filePath)).rejects.toThrow(InvalidEvaluationInputError);
  });

  it("rejects a non-array top-level structure", async () => {
    const filePath = writeFixture("object.json", JSON.stringify({ id: "case-1" }));
    await expect(loadEvaluationCases(filePath)).rejects.toThrow(InvalidEvaluationInputError);
  });

  it("rejects a case missing required fields", async () => {
    const filePath = writeFixture("bad-case.json", JSON.stringify([{ id: "case-1", jd: "JD" }]));
    await expect(loadEvaluationCases(filePath)).rejects.toThrow(InvalidEvaluationInputError);
  });

  it("rejects a case with a non-integer days value", async () => {
    const filePath = writeFixture(
      "bad-days.json",
      JSON.stringify([{ id: "case-1", jd: "JD", company_url: "https://example.com", days: 2.5 }])
    );
    await expect(loadEvaluationCases(filePath)).rejects.toThrow(InvalidEvaluationInputError);
  });

  it("rejects duplicate case ids", async () => {
    const filePath = writeFixture(
      "dup.json",
      JSON.stringify([
        { id: "case-1", jd: "A", company_url: "https://example.com", days: 3 },
        { id: "case-1", jd: "B", company_url: "https://example.com", days: 4 },
      ])
    );
    await expect(loadEvaluationCases(filePath)).rejects.toThrow(InvalidEvaluationInputError);
  });
});
