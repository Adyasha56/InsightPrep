import { KitDocument } from "../../models/kit.model";
import { env } from "../../config/env";
import { researchCompany } from "../research/company-research.service";
import { generateCompanyBrief } from "./company-brief.service";
import {
  generateBehaviouralQuestions,
  generateCompanyFitQuestions,
  generateSystemDesignQuestions,
  generateTechnicalQuestions,
  QuestionGenerationContext,
} from "./question-generation.service";
import { assignIds, buildQuestionCompanyContext } from "./kit-generation.service";
import { checkCoverage } from "../validation/coverage.service";
import { createSchedule } from "../scheduling/schedule.service";
import { validateDraftKit } from "../../validators/kit.validator";
import { RegenerateKitRequest } from "../../validators/kit.validator";
import { DraftKit, Question, QuestionCategory } from "../../types/kit.types";

// Reuses the exact same per-category generator functions (and therefore the
// exact same prompts/schemas) first-pass generation calls — regeneration
// never duplicates or reimplements this logic.
const CATEGORY_GENERATORS: Record<QuestionCategory, (context: QuestionGenerationContext) => ReturnType<typeof generateTechnicalQuestions>> = {
  technical: generateTechnicalQuestions,
  behavioural: generateBehaviouralQuestions,
  "system-design": generateSystemDesignQuestions,
  "company-fit": generateCompanyFitQuestions,
};

// Continues past the highest existing "q<n>" suffix anywhere in the kit —
// not just the regenerated category — so a freshly generated batch can never
// collide with an id in another category or from an earlier pass. Mirrors
// kit-update.service.ts's `nextId`, but assignIds wants a numeric start.
function nextQuestionIdStart(questions: Question[]): number {
  let max = 0;
  for (const question of questions) {
    if (!question.id.startsWith("q")) continue;
    const suffix = Number(question.id.slice(1));
    if (Number.isInteger(suffix) && suffix > max) max = suffix;
  }
  return max + 1;
}

// The central Phase 11 invariant: a question is safe to discard on category
// regeneration only if it is both machine-authored AND never touched since.
// origin/edited are always server-computed (Phase 10), so this can't be
// spoofed by the client.
function isReplaceable(question: Question): boolean {
  return question.origin === "generated" && !question.edited;
}

// Regenerates a single question category in place: protected questions in
// that category (user-created, hand-edited, or category-moved — all of
// which read as `edited: true`) are kept exactly where they are; only
// generated-and-untouched questions in that category are dropped and
// replaced with a fresh batch from the same generator first-pass generation
// already uses. Every other category, all flashcards, the brief, and the
// role/requirements are untouched. Schedule/coverage are recomputed from the
// resulting question set with the same deterministic functions generation
// already uses — never a partial/incremental patch, since a regeneration can
// change several questions at once.
async function regenerateCategoryDraft(kit: KitDocument, category: QuestionCategory): Promise<DraftKit> {
  const current = kit.toObject() as unknown as DraftKit;

  const research = await researchCompany(current.source.company_url, {
    allowLocalTargets: env.ALLOW_LOCAL_RESEARCH_TARGETS,
  });
  const companyContext = buildQuestionCompanyContext(research);

  const survivingQuestions = current.questions.filter((question) => question.category !== category || !isReplaceable(question));

  const freshDraftQuestions = await CATEGORY_GENERATORS[category]({
    jobDescription: current.source.job_description,
    requirements: current.role.requirements,
    role: { title: current.role.title, seniority: current.role.seniority, responsibilities: current.role.responsibilities },
    companyContext,
  });

  const freshQuestions = assignIds(freshDraftQuestions, "q", nextQuestionIdStart(current.questions));
  const questions = [...survivingQuestions, ...freshQuestions];

  const coverage = {
    uncovered_requirement_ids: checkCoverage({ role: current.role, questions }).uncovered_requirement_ids,
    passes: current.coverage.passes,
  };
  const schedule = createSchedule({
    daysAvailable: current.source.days_available,
    questions,
    requirements: current.role.requirements,
  });

  return { ...current, questions, coverage, schedule };
}

// Full, deliberate replace: there is exactly one brief per kit (no per-field
// origin to partially protect), so "regenerate the brief" always means redo
// the whole thing. Everything else in the kit is untouched. Sources come
// from fresh research, never the client (same guarantee first-pass
// generation gives).
async function regenerateCompanyBriefDraft(kit: KitDocument): Promise<DraftKit> {
  const current = kit.toObject() as unknown as DraftKit;

  const research = await researchCompany(current.source.company_url, {
    allowLocalTargets: env.ALLOW_LOCAL_RESEARCH_TARGETS,
  });
  const companyBrief = await generateCompanyBrief(current.source.company_url, research);

  return { ...current, company_brief: companyBrief };
}

// Pure and synchronous — no Gemini, no research — just like first-pass
// scheduling. Re-derives day placement/order/timing from whatever question
// set is currently persisted (already subject to the origin/edited
// invariant), so it can never disturb question content, coverage, or the
// brief.
function regenerateScheduleDraft(kit: KitDocument): DraftKit {
  const current = kit.toObject() as unknown as DraftKit;

  const schedule = createSchedule({
    daysAvailable: current.source.days_available,
    questions: current.questions,
    requirements: current.role.requirements,
  });

  return { ...current, schedule };
}

// Dispatches to the right regenerator and re-validates the result through
// the same schema every other persisted kit must satisfy — regeneration
// gets no special exemption. Nothing is persisted by this function; the
// caller decides that only after this resolves successfully, so a failure
// here (a Gemini/research error) leaves the stored kit completely untouched.
export async function buildRegeneratedDraftKit(kit: KitDocument, request: RegenerateKitRequest): Promise<DraftKit> {
  let draft: DraftKit;

  if (request.target === "company_brief") {
    draft = await regenerateCompanyBriefDraft(kit);
  } else if (request.target === "schedule") {
    draft = regenerateScheduleDraft(kit);
  } else {
    draft = await regenerateCategoryDraft(kit, request.category);
  }

  return validateDraftKit(draft);
}
