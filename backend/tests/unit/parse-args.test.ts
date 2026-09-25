import { describe, expect, it } from "vitest";
import { CliArgumentError, parseEvaluateArgs } from "../../src/cli/parse-args";

describe("parseEvaluateArgs", () => {
  it("parses --input and --output", () => {
    const args = parseEvaluateArgs(["--input", "cases.json", "--output", "kits.json"]);
    expect(args).toEqual({ input: "cases.json", output: "kits.json" });
  });

  it("accepts the flags in either order", () => {
    const args = parseEvaluateArgs(["--output", "kits.json", "--input", "cases.json"]);
    expect(args).toEqual({ input: "cases.json", output: "kits.json" });
  });

  it("throws when --input is missing", () => {
    expect(() => parseEvaluateArgs(["--output", "kits.json"])).toThrow(CliArgumentError);
  });

  it("throws when --output is missing", () => {
    expect(() => parseEvaluateArgs(["--input", "cases.json"])).toThrow(CliArgumentError);
  });

  it("throws when a flag has no value", () => {
    expect(() => parseEvaluateArgs(["--input"])).toThrow(CliArgumentError);
    expect(() => parseEvaluateArgs(["--input", "--output", "kits.json"])).toThrow(CliArgumentError);
  });

  it("throws when both flags are missing", () => {
    expect(() => parseEvaluateArgs([])).toThrow(CliArgumentError);
  });
});
