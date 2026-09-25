import "dotenv/config";
import { z } from "zod";

// Fail fast on startup rather than surfacing missing/invalid config as
// runtime errors deep inside the request pipeline.
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required."),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters."),
  JWT_EXPIRES_IN: z.string().default("7d"),
  GEMINI_API_KEY: z.string().optional(),
  // Documented default per RULES.md; overridable so a different Gemini
  // Flash model can be swapped in without a code change.
  GEMINI_MODEL: z.string().default("gemini-3.5-flash"),
  GEMINI_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
  GEMINI_MAX_RETRIES: z.coerce.number().int().nonnegative().default(2),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),

  CRAWLER_MAX_PAGES: z.coerce.number().int().positive().default(6),
  CRAWLER_MAX_DEPTH: z.coerce.number().int().positive().default(2),
  CRAWLER_MAX_RESPONSE_BYTES: z.coerce.number().int().positive().default(2_000_000),
  CRAWLER_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  CRAWLER_MAX_RETRIES: z.coerce.number().int().nonnegative().default(2),
  CRAWLER_REQUEST_DELAY_MS: z.coerce.number().int().nonnegative().default(300),
  // Explicit escape hatch so the batch evaluator can target a localhost test
  // server. Off by default; production must never enable this. z.coerce.boolean()
  // is deliberately avoided here since it treats the string "false" as truthy.
  ALLOW_LOCAL_RESEARCH_TARGETS: z
    .string()
    .optional()
    .transform((value) => value === "true" || value === "1"),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
    process.exit(1);
  }

  return parsed.data;
}

export const env = loadEnv();

export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";
