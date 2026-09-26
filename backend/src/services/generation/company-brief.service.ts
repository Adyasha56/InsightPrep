import { generateValidated } from "../ai/gemini.client";
import { buildCompanyBriefPrompt, companyBriefJsonSchema, companyBriefResponseSchema } from "../ai/prompts/company-brief.prompt";
import { CompanyBrief } from "../../types/kit.types";
import { CompanyResearchResult, PageResearchResult, ResearchSourceType } from "../../types/research.types";

const MAX_PAGES_IN_PROMPT = 5;
const MAX_TEXT_PER_PAGE = 1500;

// Homepage/about/product pages describe the company itself best; careers/
// engineering pages are more useful later, for question generation.
const SOURCE_TYPE_PRIORITY: Record<ResearchSourceType, number> = {
  homepage: 0,
  about: 1,
  product: 2,
  engineering: 3,
  careers: 4,
  other: 5,
};

function selectPagesForBrief(research: CompanyResearchResult): PageResearchResult[] {
  return [...research.pages]
    .sort((a, b) => SOURCE_TYPE_PRIORITY[a.sourceType] - SOURCE_TYPE_PRIORITY[b.sourceType])
    .slice(0, MAX_PAGES_IN_PROMPT);
}

// Uses Phase 4 research as the only source of company facts. `sources` is
// set here from the actual pages used, never asked of the model — this is
// the "application-controlled source list" RULES.md section 10 requires,
// which makes a hallucinated URL structurally impossible.
export async function generateCompanyBrief(companyUrl: string, research: CompanyResearchResult): Promise<CompanyBrief> {
  const pages = selectPagesForBrief(research);

  if (pages.length === 0) {
    return {
      summary: "No usable company information could be retrieved from the supplied website.",
      what_they_do: "Unknown — company research did not return any usable pages.",
      sources: [],
      edited: false,
    };
  }

  const { systemInstruction, prompt } = buildCompanyBriefPrompt({
    companyUrl,
    pages: pages.map((page) => ({
      url: page.url,
      sourceType: page.sourceType,
      title: page.title,
      text: page.text.slice(0, MAX_TEXT_PER_PAGE),
    })),
  });

  const result = await generateValidated({
    systemInstruction,
    prompt,
    responseJsonSchema: companyBriefJsonSchema,
    schema: companyBriefResponseSchema,
  });

  return { ...result, sources: pages.map((page) => page.url), edited: false };
}
