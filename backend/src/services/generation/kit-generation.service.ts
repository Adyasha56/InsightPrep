import { extractRequirements } from "./requirement-generation.service";
import { generateCompanyBrief } from "./company-brief.service";
import { analyzeRole } from "./role-generation.service";
import {
  generateBehaviouralQuestions,
  generateCompanyFitQuestions,
  generateSystemDesignQuestions,
  generateTechnicalQuestions,
} from "./question-generation.service";
import { generateFlashcards } from "./flashcard-generation.service";
import { generateMissingQuestions } from "./missing-question-generation.service";
import { checkCoverage } from "../validation/coverage.service";
import { createSchedule } from "../scheduling/schedule.service";
import { validateDraftKit } from "../../validators/kit.validator";
import { AppError } from "../../utils/AppError";
import { DraftKit, Flashcard, Question } from "../../types/kit.types";
import { CompanyResearchResult, ResearchSourceType } from "../../types/research.types";

export interface GenerateDraftKitInput {
  jobDescription: string;
  companyUrl: string;
  daysAvailable: number;
  research: CompanyResearchResult;
}

const HIRING_CONTEXT_SOURCE_TYPES: ResearchSourceType[] = ["careers", "engineering", "about"];
const MAX_CONTEXT_TEXT_PER_PAGE = 800;

// One initial coverage check, and — only if MUST requirements are still
// uncovered — one targeted top-up generation plus a second check. Fixed at
// 2, not a loop: this bounds Gemini calls against a free-tier API and makes
// "no infinite loop is possible" true by construction rather than by a
// runtime guard (RULES.md section 15).
const MAX_COVERAGE_PASSES = 2;

// Stamps a stable id plus the content-state fields (Phase 10): everything
// that comes out of generation starts as "generated" and unedited. Only
// application code (never Gemini) assigns these, matching how ids are
// already handled. Exported (Phase 11) so category regeneration can reuse
// the exact same id/state-stamping logic instead of duplicating it.
export function assignIds<T extends object>(
  items: T[],
  prefix: string,
  startAt = 1
): (T & { id: string; origin: "generated"; edited: false })[] {
  return items.map((item, index) => ({
    ...item,
    id: `${prefix}${startAt + index}`,
    origin: "generated" as const,
    edited: false as const,
  }));
}

// Question generation benefits from hiring/engineering signals specifically
// (interview process, tech culture) rather than the full research corpus.
// Exported (Phase 11) so category regeneration builds identical context to
// what first-pass generation used for that category.
export function buildQuestionCompanyContext(research: CompanyResearchResult): string {
  const relevant = research.pages.filter((page) => HIRING_CONTEXT_SOURCE_TYPES.includes(page.sourceType));
  if (relevant.length === 0) return "";
  return relevant
    .map((page) => `[${page.sourceType}] ${page.title}\n${page.text.slice(0, MAX_CONTEXT_TEXT_PER_PAGE)}`)
    .join("\n\n---\n\n");
}

// Orchestrates the first-pass generation pipeline as a fixed sequence of
// small, independently testable AI calls — never one giant prompt —
// followed by deterministic coverage checking and a bounded second pass.
// Coverage decides whether a requirement is addressed; Gemini only ever
// writes questions. Schedule allocation remains a placeholder for a later,
// deterministic phase (RULES.md section 23).
export async function generateDraftKit(input: GenerateDraftKitInput): Promise<DraftKit> {
  console.log("[kit-generation] started", { companyUrl: input.companyUrl });

  const requirements = await extractRequirements(input.jobDescription);
  console.log("[kit-generation] requirement extraction completed", { count: requirements.length });

  const companyBrief = await generateCompanyBrief(input.companyUrl, input.research);
  console.log("[kit-generation] company brief completed");

  const role = await analyzeRole(input.jobDescription, requirements, input.research);
  console.log("[kit-generation] role analysis completed");

  const companyContext = buildQuestionCompanyContext(input.research);
  const questionContext = {
    jobDescription: input.jobDescription,
    requirements,
    role: { title: role.title, seniority: role.seniority, responsibilities: role.responsibilities },
    companyContext,
  };

  const technicalQuestions = await generateTechnicalQuestions(questionContext);
  console.log("[kit-generation] technical questions completed", { count: technicalQuestions.length });

  const behaviouralQuestions = await generateBehaviouralQuestions(questionContext);
  console.log("[kit-generation] behavioural questions completed", { count: behaviouralQuestions.length });

  const systemDesignQuestions = await generateSystemDesignQuestions(questionContext);
  console.log("[kit-generation] system design questions completed", { count: systemDesignQuestions.length });

  const companyFitQuestions = await generateCompanyFitQuestions(questionContext);
  console.log("[kit-generation] company-fit questions completed", { count: companyFitQuestions.length });

  let questions: Question[] = assignIds(
    [...technicalQuestions, ...behaviouralQuestions, ...systemDesignQuestions, ...companyFitQuestions],
    "q"
  );

  const draftFlashcards = await generateFlashcards(requirements, questions);
  const flashcards: Flashcard[] = assignIds(draftFlashcards, "f").map((flashcard) => ({ ...flashcard, confidence: null }));
  console.log("[kit-generation] flashcards completed", { count: flashcards.length });

  let passes = 1;
  let coverage = checkCoverage({ role, questions });
  console.log("[kit-generation] coverage check completed", {
    pass: passes,
    uncovered: coverage.uncovered_requirement_ids.length,
    uncoveredMust: coverage.uncovered_must_requirement_ids.length,
  });

  if (coverage.uncovered_must_requirement_ids.length > 0 && passes < MAX_COVERAGE_PASSES) {
    const uncoveredMustRequirements = requirements.filter((requirement) =>
      coverage.uncovered_must_requirement_ids.includes(requirement.id)
    );

    try {
      const missingQuestions = await generateMissingQuestions(uncoveredMustRequirements, {
        role: { title: role.title, seniority: role.seniority, responsibilities: role.responsibilities },
        companyContext,
      });

      if (missingQuestions.length > 0) {
        const secondPassQuestions = assignIds(missingQuestions, "q", questions.length + 1);
        questions = [...questions, ...secondPassQuestions];
        console.log("[kit-generation] second-pass questions completed", { count: secondPassQuestions.length });
      }
    } catch (error) {
      // Second-pass failure must not erase the first-pass kit (RULES.md
      // section 21) — fall through and persist pass-1 questions/coverage,
      // reported honestly rather than pretending coverage is complete.
      console.log("[kit-generation] second-pass generation failed, keeping first-pass questions", {
        code: error instanceof AppError ? error.code : "UNKNOWN",
      });
    }

    passes += 1;
    coverage = checkCoverage({ role, questions });
    console.log("[kit-generation] coverage check completed", {
      pass: passes,
      uncovered: coverage.uncovered_requirement_ids.length,
      uncoveredMust: coverage.uncovered_must_requirement_ids.length,
    });
  }

  // Scheduling runs only after the final coverage pass, on the final
  // question set — it must never influence coverage, and coverage must
  // never wait on it (RULES.md section 13). Purely deterministic: no
  // Gemini call happens inside createSchedule.
  const schedule = createSchedule({
    daysAvailable: input.daysAvailable,
    questions,
    requirements,
  });
  console.log("[kit-generation] schedule allocation completed", { days: schedule.days.length });

  const draft: DraftKit = {
    source: {
      job_description: input.jobDescription,
      company_url: input.companyUrl,
      days_available: input.daysAvailable,
    },
    company_brief: companyBrief,
    role,
    questions,
    flashcards,
    schedule,
    coverage: { uncovered_requirement_ids: coverage.uncovered_requirement_ids, passes },
  };

  const validated = validateDraftKit(draft);
  console.log("[kit-generation] kit validation completed");

  return validated;
}
