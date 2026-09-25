import { z } from "zod";
import { ANTI_HALLUCINATION_RULE, JSON_ONLY_INSTRUCTION, UNTRUSTED_CONTENT_WARNING, wrapUntrustedContent } from "./shared-instructions";
import { TrustedPrompt } from "../ai.types";

// requirements are intentionally absent from this schema — role analysis
// echoes the already-extracted requirement objects rather than producing a
// second, independent set (RULES.md section 12).
export const roleAnalysisResponseSchema = z.object({
  title: z.string().min(1),
  seniority: z.string().min(1).max(80),
  responsibilities: z.array(z.string().min(1)).max(15),
});

export const roleAnalysisJsonSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    seniority: { type: "string" },
    responsibilities: { type: "array", maxItems: 15, items: { type: "string" } },
  },
  required: ["title", "seniority", "responsibilities"],
};

export interface RoleAnalysisPromptInput {
  jobDescription: string;
  requirementTexts: string[];
  companyContext: string;
}

export function buildRoleAnalysisPrompt(input: RoleAnalysisPromptInput): TrustedPrompt {
  const systemInstruction = [
    "You analyse a job description to produce a role breakdown for an interview-preparation tool.",
    ANTI_HALLUCINATION_RULE,
    "Responsibilities must be supported by the job description text.",
    "Infer the role title only when reasonably supported by the text.",
    'If the job description does not clearly state a seniority level, use a value like "Not specified" instead ' +
      "of inventing a specific level such as Senior or Junior.",
    JSON_ONLY_INSTRUCTION,
  ].join(" ");

  const requirementsBlock =
    input.requirementTexts.length > 0
      ? input.requirementTexts.map((text) => `- ${text}`).join("\n")
      : "No requirements were extracted from the job description.";

  const prompt = [
    UNTRUSTED_CONTENT_WARNING,
    wrapUntrustedContent("JOB_DESCRIPTION", input.jobDescription),
    wrapUntrustedContent("EXTRACTED_REQUIREMENTS", requirementsBlock),
    wrapUntrustedContent("COMPANY_RESEARCH", input.companyContext || "No company research available."),
    "Analyse the role described above and return its title, seniority, and responsibilities.",
  ].join("\n\n");

  return { systemInstruction, prompt };
}
