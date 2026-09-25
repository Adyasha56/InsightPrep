import { generateValidated } from "../ai/gemini.client";
import {
  buildMissingQuestionPrompt,
  buildMissingQuestionResponseSchema,
  missingQuestionResponseJsonSchema,
} from "../ai/prompts/missing-question-generation.prompt";
import { Question, Requirement, Role } from "../../types/kit.types";

export interface MissingQuestionContext {
  role: Pick<Role, "title" | "seniority" | "responsibilities">;
  companyContext: string;
}

type DraftQuestion = Omit<Question, "id">;

function buildRoleContext(role: MissingQuestionContext["role"]): string {
  const lines = [`Title: ${role.title || "Not specified"}`, `Seniority: ${role.seniority || "Not specified"}`];
  if (role.responsibilities.length > 0) {
    lines.push(`Responsibilities:\n${role.responsibilities.map((r) => `- ${r}`).join("\n")}`);
  }
  return lines.join("\n");
}

// Targeted second pass: a single bounded call that generates questions ONLY
// for the specific requirements the deterministic coverage check found
// uncovered — never a full re-generation of the question set (RULES.md
// section 8/12).
export async function generateMissingQuestions(
  uncoveredRequirements: Requirement[],
  context: MissingQuestionContext
): Promise<DraftQuestion[]> {
  if (uncoveredRequirements.length === 0) {
    return [];
  }

  const requiredRequirementIds = uncoveredRequirements.map((requirement) => requirement.id);

  const { systemInstruction, prompt } = buildMissingQuestionPrompt({
    uncoveredRequirements,
    roleContext: buildRoleContext(context.role),
    companyContext: context.companyContext,
  });

  const result = await generateValidated({
    systemInstruction,
    prompt,
    responseJsonSchema: missingQuestionResponseJsonSchema,
    schema: buildMissingQuestionResponseSchema(requiredRequirementIds),
  });

  return result.questions;
}
