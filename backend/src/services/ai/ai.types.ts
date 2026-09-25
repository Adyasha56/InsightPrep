import { ZodType } from "zod";

export interface TrustedPrompt {
  systemInstruction: string;
  prompt: string;
}

export interface GenerateValidatedOptions<T> extends TrustedPrompt {
  // JSON Schema handed to Gemini's structured-output mode (best-effort
  // provider-side constraint — application-side zod validation is still
  // mandatory regardless, per RULES.md section 5).
  responseJsonSchema: Record<string, unknown>;
  schema: ZodType<T>;
  maxNetworkRetries?: number;
  maxRepairAttempts?: number;
}
