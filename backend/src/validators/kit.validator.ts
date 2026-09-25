import { z } from "zod";
import { AppError } from "../utils/AppError";
import { ErrorCode } from "../types/error-code.types";
import { DraftKit } from "../types/kit.types";

// Mirrors src/types/kit.types.ts field-for-field. Kept as a hand-maintained
// parallel schema (rather than deriving types from zod, or vice versa) so
// each stays easy to read on its own; tests/unit/kit.validator.test.ts is
// the drift check between the two.
export const requirementSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  kind: z.enum(["technical", "behavioural", "domain"]),
  priority: z.enum(["must", "nice"]),
});

export const questionSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
  answer_outline: z.string().min(1),
  // Only exactly 1, 2, or 3 — not "easy"/"medium"/"hard" or arbitrary numbers.
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  category: z.enum(["technical", "behavioural", "system-design", "company-fit"]),
  requirement_ids: z.array(z.string().min(1)),
});

export const flashcardSchema = z.object({
  id: z.string().min(1),
  front: z.string().min(1),
  back: z.string().min(1),
  requirement_ids: z.array(z.string().min(1)),
});

export const companyBriefSchema = z.object({
  summary: z.string(),
  what_they_do: z.string(),
  sources: z.array(z.string()),
});

export const roleSchema = z.object({
  title: z.string(),
  seniority: z.string(),
  responsibilities: z.array(z.string()),
  requirements: z.array(requirementSchema),
});

export const scheduleDaySchema = z.object({
  day: z.number().int().positive(),
  focus: z.string().min(1),
  question_ids: z.array(z.string().min(1)),
  minutes: z.number().int().nonnegative(),
});

export const scheduleSchema = z.object({
  days_available: z.number().int().positive(),
  days: z.array(scheduleDaySchema),
});

export const coverageSchema = z.object({
  uncovered_requirement_ids: z.array(z.string()),
  passes: z.number().int().nonnegative(),
});

export const kitSourceSchema = z.object({
  job_description: z.string().min(1),
  company_url: z.string().min(1),
  days_available: z.number().int().positive(),
});

export const draftKitSchema = z
  .object({
    source: kitSourceSchema,
    company_brief: companyBriefSchema,
    role: roleSchema,
    questions: z.array(questionSchema),
    flashcards: z.array(flashcardSchema),
    schedule: scheduleSchema,
    coverage: coverageSchema,
  })
  // Cross-field checks that a per-field schema can't express: reference
  // integrity and ID uniqueness across the whole kit.
  .superRefine((kit, ctx) => {
    const requirementIds = new Set(kit.role.requirements.map((r) => r.id));
    if (requirementIds.size !== kit.role.requirements.length) {
      ctx.addIssue("Duplicate requirement IDs are not allowed.");
    }

    const questionIds = new Set<string>();
    kit.questions.forEach((question, index) => {
      if (questionIds.has(question.id)) {
        ctx.addIssue(`Duplicate question id "${question.id}".`);
      }
      questionIds.add(question.id);

      question.requirement_ids.forEach((id) => {
        if (!requirementIds.has(id)) {
          ctx.addIssue(`questions[${index}] (${question.id}) references unknown requirement id "${id}".`);
        }
      });
    });

    const flashcardIds = new Set<string>();
    kit.flashcards.forEach((flashcard, index) => {
      if (flashcardIds.has(flashcard.id)) {
        ctx.addIssue(`Duplicate flashcard id "${flashcard.id}".`);
      }
      flashcardIds.add(flashcard.id);

      flashcard.requirement_ids.forEach((id) => {
        if (!requirementIds.has(id)) {
          ctx.addIssue(`flashcards[${index}] (${flashcard.id}) references unknown requirement id "${id}".`);
        }
      });
    });

    kit.coverage.uncovered_requirement_ids.forEach((id) => {
      if (!requirementIds.has(id)) {
        ctx.addIssue(`coverage.uncovered_requirement_ids references unknown requirement id "${id}".`);
      }
    });

    // Schedule structure (RULES.md section 12): days_available must match
    // the original request and the actual day count, day numbers must run
    // 1..N in order, every question_id must be real, and no question may
    // be scheduled on more than one day.
    if (kit.schedule.days_available !== kit.source.days_available) {
      ctx.addIssue("schedule.days_available must match source.days_available.");
    }
    if (kit.schedule.days.length !== kit.schedule.days_available) {
      ctx.addIssue("schedule.days must contain exactly days_available entries.");
    }

    const scheduledQuestionIds = new Set<string>();
    kit.schedule.days.forEach((day, dayIndex) => {
      if (day.day !== dayIndex + 1) {
        ctx.addIssue(`schedule.days[${dayIndex}].day must equal ${dayIndex + 1}.`);
      }
      day.question_ids.forEach((id) => {
        if (!questionIds.has(id)) {
          ctx.addIssue(`schedule.days[${dayIndex}] references unknown question id "${id}".`);
        }
        if (scheduledQuestionIds.has(id)) {
          ctx.addIssue(`schedule.days[${dayIndex}] duplicates question id "${id}", already scheduled elsewhere.`);
        }
        scheduledQuestionIds.add(id);
      });
    });

    // Every MUST requirement that the final question set actually covers
    // must be represented somewhere in the schedule. A MUST requirement
    // with no covering question at all is a coverage-phase concern, not a
    // scheduling failure (RULES.md section 16), so it's intentionally
    // excluded from this check.
    const mustRequirementIds = new Set(
      kit.role.requirements.filter((requirement) => requirement.priority === "must").map((requirement) => requirement.id)
    );
    mustRequirementIds.forEach((requirementId) => {
      const coveringQuestions = kit.questions.filter((question) => question.requirement_ids.includes(requirementId));
      if (coveringQuestions.length === 0) return;

      const isScheduled = coveringQuestions.some((question) => scheduledQuestionIds.has(question.id));
      if (!isScheduled) {
        ctx.addIssue(`MUST requirement "${requirementId}" is covered by a question but not represented in the schedule.`);
      }
    });
  });

// Reused by both the generation pipeline (validating a freshly generated
// draft before persistence) and any later phase that edits a kit.
export function validateDraftKit(data: unknown): DraftKit {
  const result = draftKitSchema.safeParse(data);
  if (!result.success) {
    throw new AppError(ErrorCode.INVALID_KIT, "The generated kit failed validation.", 502, result.error.flatten());
  }
  return result.data as DraftKit;
}

export const createKitRequestSchema = z.object({
  job_description: z.string().trim().min(1, "job_description is required."),
  company_url: z.string().trim().min(1, "company_url is required."),
  days_available: z.coerce.number().int().min(1).max(60),
});
