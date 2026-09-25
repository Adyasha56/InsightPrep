import { z } from "zod";
import { ANTI_HALLUCINATION_RULE, JSON_ONLY_INSTRUCTION, UNTRUSTED_CONTENT_WARNING, wrapUntrustedContent } from "./shared-instructions";
import { TrustedPrompt } from "../ai.types";

// Sources are deliberately NOT part of the model's response — see
// company-brief.service.ts, which sets them from the actual Phase 4 pages
// used, so the model can never hallucinate a URL.
export const companyBriefResponseSchema = z.object({
  summary: z.string().min(1),
  what_they_do: z.string().min(1),
});

export const companyBriefJsonSchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    what_they_do: { type: "string" },
  },
  required: ["summary", "what_they_do"],
};

export interface CompanyBriefPromptPage {
  url: string;
  sourceType: string;
  title: string;
  text: string;
}

export interface CompanyBriefPromptInput {
  companyUrl: string;
  pages: CompanyBriefPromptPage[];
}

export function buildCompanyBriefPrompt(input: CompanyBriefPromptInput): TrustedPrompt {
  const systemInstruction = [
    "You write a short, honest company brief for an interview-preparation tool, using only the supplied website research.",
    ANTI_HALLUCINATION_RULE,
    "Do not invent products, revenue, customers, technologies, hiring practices, locations, or culture that are " +
      "not stated in the research below.",
    "If the research is sparse or missing useful detail, say so plainly in the summary rather than filling gaps " +
      "with assumptions.",
    JSON_ONLY_INSTRUCTION,
  ].join(" ");

  const researchBlock = input.pages
    .map((page) => `[${page.sourceType}] ${page.title}\n${page.text}`)
    .join("\n\n---\n\n");

  const prompt = [
    UNTRUSTED_CONTENT_WARNING,
    wrapUntrustedContent("COMPANY_RESEARCH", researchBlock),
    `Company URL: ${input.companyUrl}`,
    "Write a company brief (summary and what_they_do) using only the research above.",
  ].join("\n\n");

  return { systemInstruction, prompt };
}
