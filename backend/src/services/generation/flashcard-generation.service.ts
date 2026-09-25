import { generateValidated } from "../ai/gemini.client";
import { buildFlashcardGenerationPrompt, buildFlashcardResponseSchema, flashcardResponseJsonSchema } from "../ai/prompts/flashcard-generation.prompt";
import { Flashcard, Question, Requirement } from "../../types/kit.types";

type DraftFlashcard = Omit<Flashcard, "id">;

export async function generateFlashcards(requirements: Requirement[], questions: Question[]): Promise<DraftFlashcard[]> {
  if (requirements.length === 0 && questions.length === 0) {
    return [];
  }

  const allowedRequirementIds = requirements.map((requirement) => requirement.id);

  const { systemInstruction, prompt } = buildFlashcardGenerationPrompt({ requirements, questions });

  const result = await generateValidated({
    systemInstruction,
    prompt,
    responseJsonSchema: flashcardResponseJsonSchema,
    schema: buildFlashcardResponseSchema(allowedRequirementIds),
  });

  return result.flashcards;
}
