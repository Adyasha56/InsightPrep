import { z } from "zod";
import { ANTI_HALLUCINATION_RULE, JSON_ONLY_INSTRUCTION, UNTRUSTED_CONTENT_WARNING, wrapUntrustedContent } from "./shared-instructions";
import { TrustedPrompt } from "../ai.types";

const rawRequirementSchema = z.object({
  text: z.string().min(1),
  kind: z.enum(["technical", "behavioural", "domain"]),
  priority: z.enum(["must", "nice"]),
});

export const requirementExtractionResponseSchema = z.object({
  requirements: z.array(rawRequirementSchema).max(30),
});

export const requirementExtractionJsonSchema = {
  type: "object",
  properties: {
    requirements: {
      type: "array",
      maxItems: 30,
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          kind: { type: "string", enum: ["technical", "behavioural", "domain"] },
          priority: { type: "string", enum: ["must", "nice"] },
        },
        required: ["text", "kind", "priority"],
      },
    },
  },
  required: ["requirements"],
};

export function buildRequirementExtractionPrompt(jobDescription: string): TrustedPrompt {
  const systemInstruction = [
    "You extract hiring requirements from a job description for an interview-preparation tool.",
    ANTI_HALLUCINATION_RULE,
    "Only extract requirements that are explicitly stated or clearly implied by the job description text.",
    "Do not invent technologies, years of experience, tools, or qualifications that are not present in the text.",
    'Classify priority carefully: wording such as "required", "must have", "you need", or "essential" means ' +
      'priority "must". Wording such as "nice to have", "bonus", "preferred", or "plus" means priority "nice". ' +
      "Never upgrade a nice-to-have into a must-have, or the reverse.",
    "If the job description is short or vague, return only the few requirements it actually supports. An empty " +
      "or short list is the correct output when the text does not support more — never pad the list.",
    JSON_ONLY_INSTRUCTION,
  ].join(" ");

  const prompt = [
    UNTRUSTED_CONTENT_WARNING,
    wrapUntrustedContent("JOB_DESCRIPTION", jobDescription),
    "Extract the requirements described in the job description above.",
  ].join("\n\n");

  return { systemInstruction, prompt };
}
