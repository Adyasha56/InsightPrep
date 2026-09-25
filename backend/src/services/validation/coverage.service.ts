import { Question, Requirement } from "../../types/kit.types";

export interface CoverageResult {
  covered_requirement_ids: string[];
  uncovered_requirement_ids: string[];
  uncovered_must_requirement_ids: string[];
  uncovered_nice_requirement_ids: string[];
  coverage_complete: boolean;
}

export interface CoverageInput {
  role: { requirements: Requirement[] };
  questions: Question[];
}

// Pure and deterministic: a requirement is covered iff at least one
// question's requirement_ids includes its id. This is the sole source of
// truth — never question/answer text, flashcards, or the company brief
// (RULES.md section 5). Gemini never decides coverage; this function is the
// only authority on it.
export function checkCoverage(kit: CoverageInput): CoverageResult {
  const referencedIds = new Set<string>();
  kit.questions.forEach((question) => {
    question.requirement_ids.forEach((id) => referencedIds.add(id));
  });

  const covered: string[] = [];
  const uncovered: string[] = [];
  const uncoveredMust: string[] = [];
  const uncoveredNice: string[] = [];

  for (const requirement of kit.role.requirements) {
    if (referencedIds.has(requirement.id)) {
      covered.push(requirement.id);
      continue;
    }
    uncovered.push(requirement.id);
    if (requirement.priority === "must") {
      uncoveredMust.push(requirement.id);
    } else {
      uncoveredNice.push(requirement.id);
    }
  }

  return {
    covered_requirement_ids: covered,
    uncovered_requirement_ids: uncovered,
    uncovered_must_requirement_ids: uncoveredMust,
    uncovered_nice_requirement_ids: uncoveredNice,
    // The assignment's completion bar is specifically about MUST
    // requirements (RULES.md section 3/18) — nice-to-have gaps are reported
    // but never block completion.
    coverage_complete: uncoveredMust.length === 0,
  };
}
