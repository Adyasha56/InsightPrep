import { generateValidated } from "../ai/gemini.client";
import { buildQuestionGenerationPrompt, buildQuestionResponseSchema, questionResponseJsonSchema } from "../ai/prompts/question-generation.prompt";
import { Question, QuestionCategory, Requirement, Role } from "../../types/kit.types";

export interface QuestionGenerationContext {
  jobDescription: string;
  requirements: Requirement[];
  role: Pick<Role, "title" | "seniority" | "responsibilities">;
  companyContext: string;
}

type DraftQuestion = Omit<Question, "id" | "origin" | "edited">;

// Requirements relevant to each category are filtered in application code
// rather than trusted to the model — this keeps category boundaries
// deterministic (RULES.md sections 14-15) instead of relying on the model
// to self-restrict.
function requirementsForCategory(category: QuestionCategory, requirements: Requirement[]): Requirement[] {
  if (category === "technical") return requirements.filter((r) => r.kind === "technical");
  if (category === "behavioural") return requirements.filter((r) => r.kind === "behavioural");
  // system-design and company-fit draw on the full requirement set as
  // context rather than one specific kind.
  return requirements;
}

function buildRoleContext(role: QuestionGenerationContext["role"]): string {
  const lines = [`Title: ${role.title || "Not specified"}`, `Seniority: ${role.seniority || "Not specified"}`];
  if (role.responsibilities.length > 0) {
    lines.push(`Responsibilities:\n${role.responsibilities.map((r) => `- ${r}`).join("\n")}`);
  }
  return lines.join("\n");
}

async function generateQuestionsForCategory(
  category: QuestionCategory,
  context: QuestionGenerationContext
): Promise<DraftQuestion[]> {
  const relevantRequirements = requirementsForCategory(category, context.requirements);

  // No technical requirements -> no technical questions, deterministically.
  // Same for behavioural. system-design/company-fit are allowed to proceed
  // on role/company context alone (and may legitimately return nothing).
  if ((category === "technical" || category === "behavioural") && relevantRequirements.length === 0) {
    return [];
  }

  const allowedRequirementIds = context.requirements.map((r) => r.id);

  const { systemInstruction, prompt } = buildQuestionGenerationPrompt({
    category,
    jobDescription: context.jobDescription,
    requirements: relevantRequirements,
    roleContext: buildRoleContext(context.role),
    companyContext: context.companyContext,
  });

  const result = await generateValidated({
    systemInstruction,
    prompt,
    responseJsonSchema: questionResponseJsonSchema,
    schema: buildQuestionResponseSchema(allowedRequirementIds),
  });

  return result.questions.map((question) => ({ ...question, category }));
}

export function generateTechnicalQuestions(context: QuestionGenerationContext): Promise<DraftQuestion[]> {
  return generateQuestionsForCategory("technical", context);
}

export function generateBehaviouralQuestions(context: QuestionGenerationContext): Promise<DraftQuestion[]> {
  return generateQuestionsForCategory("behavioural", context);
}

export function generateSystemDesignQuestions(context: QuestionGenerationContext): Promise<DraftQuestion[]> {
  return generateQuestionsForCategory("system-design", context);
}

export function generateCompanyFitQuestions(context: QuestionGenerationContext): Promise<DraftQuestion[]> {
  return generateQuestionsForCategory("company-fit", context);
}
