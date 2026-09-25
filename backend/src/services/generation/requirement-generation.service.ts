import { generateValidated } from "../ai/gemini.client";
import {
  buildRequirementExtractionPrompt,
  requirementExtractionJsonSchema,
  requirementExtractionResponseSchema,
} from "../ai/prompts/requirement-extraction.prompt";
import { Requirement } from "../../types/kit.types";

function normalizeForDedupe(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

// Extracts requirements from the JD only (never fetched from the internet —
// the JD is user-supplied) and assigns stable IDs in application code, per
// RULES.md section 9: Gemini is never trusted with kit-wide identity.
export async function extractRequirements(jobDescription: string): Promise<Requirement[]> {
  const { systemInstruction, prompt } = buildRequirementExtractionPrompt(jobDescription);

  const result = await generateValidated({
    systemInstruction,
    prompt,
    responseJsonSchema: requirementExtractionJsonSchema,
    schema: requirementExtractionResponseSchema,
  });

  const seen = new Set<string>();
  const deduped = result.requirements.filter((requirement) => {
    const key = normalizeForDedupe(requirement.text);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return deduped.map((requirement, index) => ({ id: `r${index + 1}`, ...requirement }));
}
