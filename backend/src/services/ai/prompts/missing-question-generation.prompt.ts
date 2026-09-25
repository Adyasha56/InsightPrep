import { z } from "zod";
import { ANTI_HALLUCINATION_RULE, JSON_ONLY_INSTRUCTION, UNTRUSTED_CONTENT_WARNING, wrapUntrustedContent } from "./shared-instructions";
import { TrustedPrompt } from "../ai.types";
import { Requirement } from "../../../types/kit.types";

const rawMissingQuestionSchema = z.object({
  prompt: z.string().min(1),
  answer_outline: z.string().min(1),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  category: z.enum(["technical", "behavioural", "system-design", "company-fit"]),
  requirement_ids: z.array(z.string()).min(1),
});

// Every requirement passed in must end up referenced by at least one
// returned question — that's what actually closes the coverage gap this
// second pass exists for. Checked the same way an out-of-range reference
// is (RULES.md section 21): a schema-level failure that triggers the
// client's existing bounded repair retry, not a bespoke mechanism.
export function buildMissingQuestionResponseSchema(requiredRequirementIds: string[]) {
  return z.object({
    questions: z
      .array(rawMissingQuestionSchema)
      .min(1)
      .max(requiredRequirementIds.length + 3)
      .superRefine((questions, ctx) => {
        const allowed = new Set(requiredRequirementIds);
        const covered = new Set<string>();

        questions.forEach((question, index) => {
          question.requirement_ids.forEach((id) => {
            if (!allowed.has(id)) {
              ctx.addIssue(`questions[${index}] references requirement id "${id}", which is outside the uncovered set.`);
            }
            covered.add(id);
          });
        });

        requiredRequirementIds.forEach((id) => {
          if (!covered.has(id)) {
            ctx.addIssue(`No generated question references required uncovered requirement id "${id}".`);
          }
        });
      }),
  });
}

export const missingQuestionResponseJsonSchema = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          prompt: { type: "string" },
          answer_outline: { type: "string" },
          difficulty: { type: "integer", enum: [1, 2, 3] },
          category: { type: "string", enum: ["technical", "behavioural", "system-design", "company-fit"] },
          requirement_ids: { type: "array", items: { type: "string" } },
        },
        required: ["prompt", "answer_outline", "difficulty", "category", "requirement_ids"],
      },
    },
  },
  required: ["questions"],
};

export interface MissingQuestionPromptInput {
  uncoveredRequirements: Requirement[];
  roleContext: string;
  companyContext: string;
}

export function buildMissingQuestionPrompt(input: MissingQuestionPromptInput): TrustedPrompt {
  const systemInstruction = [
    "You write interview questions for an interview-preparation tool, specifically to close a coverage gap in an " +
      "already-generated kit.",
    "The requirements below were NOT covered by the first generated question set. Generate questions that " +
      "directly address them — every one of them must be referenced by at least one generated question's " +
      "requirement_ids.",
    "Choose whichever category (technical, behavioural, system-design, or company-fit) best fits each " +
      "requirement's kind and the role context: a technical requirement normally gets a technical question, a " +
      "behavioural requirement a behavioural question, and a domain requirement whichever category genuinely " +
      "fits it.",
    ANTI_HALLUCINATION_RULE,
    "Do not invent new requirements — only reference the requirement ids listed below. A single question may " +
      "reference more than one id if it genuinely tests both.",
    "difficulty must be exactly 1 (foundational), 2 (intermediate), or 3 (advanced).",
    JSON_ONLY_INSTRUCTION,
  ].join(" ");

  const requirementsBlock = input.uncoveredRequirements
    .map((r) => `- [${r.id}] (${r.kind}, ${r.priority}) ${r.text}`)
    .join("\n");

  const prompt = [
    UNTRUSTED_CONTENT_WARNING,
    wrapUntrustedContent("UNCOVERED_REQUIREMENTS", requirementsBlock),
    wrapUntrustedContent("ROLE_CONTEXT", input.roleContext || "No role context available."),
    wrapUntrustedContent("COMPANY_RESEARCH", input.companyContext || "No company research available."),
    "Generate the missing questions now.",
  ].join("\n\n");

  return { systemInstruction, prompt };
}
