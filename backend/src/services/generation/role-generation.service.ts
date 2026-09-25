import { generateValidated } from "../ai/gemini.client";
import { buildRoleAnalysisPrompt, roleAnalysisJsonSchema, roleAnalysisResponseSchema } from "../ai/prompts/role-analysis.prompt";
import { Requirement, Role } from "../../types/kit.types";
import { CompanyResearchResult } from "../../types/research.types";

const MAX_PAGES = 4;
const MAX_TEXT_PER_PAGE = 800;

function buildCompanyContext(research: CompanyResearchResult): string {
  const relevant = research.pages.filter((page) => page.sourceType !== "other").slice(0, MAX_PAGES);
  if (relevant.length === 0) return "";
  return relevant.map((page) => `[${page.sourceType}] ${page.title}\n${page.text.slice(0, MAX_TEXT_PER_PAGE)}`).join("\n\n---\n\n");
}

// Analyses title/seniority/responsibilities only. The requirement objects
// passed in are echoed back verbatim — role analysis must never produce a
// second, independent set of requirements (RULES.md section 12).
export async function analyzeRole(
  jobDescription: string,
  requirements: Requirement[],
  research: CompanyResearchResult
): Promise<Role> {
  const { systemInstruction, prompt } = buildRoleAnalysisPrompt({
    jobDescription,
    requirementTexts: requirements.map((requirement) => requirement.text),
    companyContext: buildCompanyContext(research),
  });

  const result = await generateValidated({
    systemInstruction,
    prompt,
    responseJsonSchema: roleAnalysisJsonSchema,
    schema: roleAnalysisResponseSchema,
  });

  return { ...result, requirements };
}
