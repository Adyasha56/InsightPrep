export interface EvaluateCliArgs {
  input: string;
  output: string;
}

export class CliArgumentError extends Error {}

// Hand-rolled rather than pulling in a CLI-parsing dependency — the
// required surface is exactly two named, single-valued, required flags
// (RULES.md section 4/22), which doesn't justify a new dependency.
export function parseEvaluateArgs(argv: string[]): EvaluateCliArgs {
  const flags = new Map<string, string>();

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--input" || token === "--output") {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new CliArgumentError(`Missing value for ${token}.`);
      }
      flags.set(token.slice(2), value);
      i += 1;
    }
  }

  const input = flags.get("input");
  const output = flags.get("output");

  if (!input) {
    throw new CliArgumentError("Missing required argument: --input <path>");
  }
  if (!output) {
    throw new CliArgumentError("Missing required argument: --output <path>");
  }

  return { input, output };
}
