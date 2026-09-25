import { z } from "zod";
import { ANTI_HALLUCINATION_RULE, JSON_ONLY_INSTRUCTION, UNTRUSTED_CONTENT_WARNING, wrapUntrustedContent } from "./shared-instructions";
import { TrustedPrompt } from "../ai.types";
import { QuestionCategory, Requirement } from "../../../types/kit.types";

const rawQuestionSchema = z.object({
  prompt: z.string().min(1),
  answer_outline: z.string().min(1),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  requirement_ids: z.array(z.string()).default([]),
});

// Built per-call with the current requirement ID set baked in, so an
// out-of-range reference (RULES.md section 21) fails validation the same
// way a malformed field would — both trigger the client's bounded repair
// retry, rather than needing a second ad-hoc mechanism.
export function buildQuestionResponseSchema(allowedRequirementIds: string[]) {
  return z.object({
    questions: z
      .array(rawQuestionSchema)
      .max(8)
      .superRefine((questions, ctx) => {
        questions.forEach((question, index) => {
          question.requirement_ids.forEach((id) => {
            if (!allowedRequirementIds.includes(id)) {
              ctx.addIssue(`questions[${index}] references unknown requirement id "${id}".`);
            }
          });
        });
      }),
  });
}

export const questionResponseJsonSchema = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        properties: {
          prompt: { type: "string" },
          answer_outline: { type: "string" },
          difficulty: { type: "integer", enum: [1, 2, 3] },
          requirement_ids: { type: "array", items: { type: "string" } },
        },
        required: ["prompt", "answer_outline", "difficulty", "requirement_ids"],
      },
    },
  },
  required: ["questions"],
};

const CATEGORY_INSTRUCTIONS: Record<QuestionCategory, string> = {
  technical:
    "Generate technical interview questions that test the specific technologies/skills named in the technical " +
    "requirements below. Do not write questions for purely behavioural requirements.",
  behavioural:
    "Generate behavioural interview questions (e.g. leadership, mentoring, communication, stakeholder " +
    "management) grounded in the behavioural requirements and role responsibilities below. Do not write generic " +
    "behavioural questions unless they are supported by the requirements or responsibilities.",
  "system-design":
    "Generate system-design interview questions ONLY if justified by the role's seniority, backend/full-stack/" +
    "distributed-systems responsibilities, or explicit architecture requirements below. If there is no such " +
    "evidence, return an empty questions array instead of forcing system-design questions onto the role.",
  "company-fit":
    "Generate company-fit interview questions using only the company research and role responsibilities below " +
    "(products, mission, culture, hiring process where explicitly stated). If the research is sparse, keep " +
    "questions generic and clearly grounded in what is actually available — do not invent company facts.",
};

export interface QuestionGenerationPromptInput {
  category: QuestionCategory;
  jobDescription: string;
  requirements: Requirement[];
  roleContext: string;
  companyContext: string;
}

export function buildQuestionGenerationPrompt(input: QuestionGenerationPromptInput): TrustedPrompt {
  const systemInstruction = [
    `You write ${input.category} interview questions for an interview-preparation tool.`,
    CATEGORY_INSTRUCTIONS[input.category],
    ANTI_HALLUCINATION_RULE,
    "Every requirement_ids entry must be one of the requirement ids listed below — never invent a new id, and " +
      "omit the field or use an empty array if no requirement applies.",
    "Choose a bounded, sensible number of questions (0 to 8) rather than generating as many as possible.",
    "difficulty must be exactly 1 (foundational), 2 (intermediate), or 3 (advanced).",
    JSON_ONLY_INSTRUCTION,
  ].join(" ");

  const requirementsBlock =
    input.requirements.length > 0
      ? input.requirements.map((r) => `- [${r.id}] (${r.kind}, ${r.priority}) ${r.text}`).join("\n")
      : "No requirements of this kind were extracted.";

  const prompt = [
    UNTRUSTED_CONTENT_WARNING,
    wrapUntrustedContent("JOB_DESCRIPTION", input.jobDescription),
    wrapUntrustedContent("REQUIREMENTS", requirementsBlock),
    wrapUntrustedContent("ROLE_CONTEXT", input.roleContext || "No role context available."),
    wrapUntrustedContent("COMPANY_RESEARCH", input.companyContext || "No company research available."),
    `Generate ${input.category} questions now.`,
  ].join("\n\n");

  return { systemInstruction, prompt };
}
