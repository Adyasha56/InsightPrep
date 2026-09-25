import { z } from "zod";
import { ANTI_HALLUCINATION_RULE, JSON_ONLY_INSTRUCTION, UNTRUSTED_CONTENT_WARNING, wrapUntrustedContent } from "./shared-instructions";
import { TrustedPrompt } from "../ai.types";
import { Question, Requirement } from "../../../types/kit.types";

const rawFlashcardSchema = z.object({
  front: z.string().min(1),
  back: z.string().min(1),
  requirement_ids: z.array(z.string()).default([]),
});

export function buildFlashcardResponseSchema(allowedRequirementIds: string[]) {
  return z.object({
    flashcards: z
      .array(rawFlashcardSchema)
      .max(12)
      .superRefine((flashcards, ctx) => {
        flashcards.forEach((flashcard, index) => {
          flashcard.requirement_ids.forEach((id) => {
            if (!allowedRequirementIds.includes(id)) {
              ctx.addIssue(`flashcards[${index}] references unknown requirement id "${id}".`);
            }
          });
        });
      }),
  });
}

export const flashcardResponseJsonSchema = {
  type: "object",
  properties: {
    flashcards: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        properties: {
          front: { type: "string" },
          back: { type: "string" },
          requirement_ids: { type: "array", items: { type: "string" } },
        },
        required: ["front", "back", "requirement_ids"],
      },
    },
  },
  required: ["flashcards"],
};

export interface FlashcardPromptInput {
  requirements: Requirement[];
  questions: Question[];
}

export function buildFlashcardGenerationPrompt(input: FlashcardPromptInput): TrustedPrompt {
  const systemInstruction = [
    "You create concise study flashcards for an interview-preparation tool, reinforcing the requirements and " +
      "questions below.",
    ANTI_HALLUCINATION_RULE,
    "Do not introduce concepts unrelated to the supplied requirements or questions.",
    "Every requirement_ids entry must be one of the requirement ids listed below.",
    "Choose a bounded, sensible number of flashcards (0 to 12).",
    JSON_ONLY_INSTRUCTION,
  ].join(" ");

  const requirementsBlock =
    input.requirements.length > 0
      ? input.requirements.map((r) => `- [${r.id}] ${r.text}`).join("\n")
      : "No requirements were extracted.";

  const questionsBlock =
    input.questions.length > 0
      ? input.questions.map((q) => `- [${q.category}] ${q.prompt}`).join("\n")
      : "No questions were generated.";

  const prompt = [
    UNTRUSTED_CONTENT_WARNING,
    wrapUntrustedContent("REQUIREMENTS", requirementsBlock),
    wrapUntrustedContent("QUESTIONS", questionsBlock),
    "Generate flashcards now.",
  ].join("\n\n");

  return { systemInstruction, prompt };
}
