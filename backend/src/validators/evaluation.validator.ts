import { z } from "zod";
import { MAX_SCHEDULE_DAYS } from "../services/scheduling/schedule.service";

// company_url's deep syntax/SSRF validation already happens inside the
// pipeline (services/retrieval/url-validation.service.ts, via
// researchCompany) — duplicating it here would just re-check the same rule
// twice. This schema only validates the case's own shape; a bad URL
// surfaces naturally as a per-case "failed" result once the pipeline runs.
export const evaluationCaseSchema = z.object({
  id: z.string().trim().min(1, "id is required."),
  jd: z.string().min(1, "jd is required."),
  company_url: z.string().trim().min(1, "company_url is required."),
  // Reuses the same day bound the rest of the application enforces
  // (validators/kit.validator.ts's createKitRequestSchema) rather than a
  // second, independently-chosen limit.
  days: z.number().int().min(1).max(MAX_SCHEDULE_DAYS),
});

export const evaluationInputSchema = z.array(evaluationCaseSchema).min(1, "At least one case is required.");
