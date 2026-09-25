import { researchCompany } from "../research/company-research.service";
import { generateDraftKit } from "../generation/kit-generation.service";
import { DraftKit } from "../../types/kit.types";
import { env } from "../../config/env";

export interface RunCasePipelineInput {
  jobDescription: string;
  companyUrl: string;
  daysAvailable: number;
}

// The exact same two application-level calls the HTTP kit-generation
// endpoint uses (controllers/kit.controller.ts's generateKit): Phase 4
// research, then generateDraftKit — which already composes requirement
// extraction, company brief, role analysis, category question generation,
// coverage checking, the bounded second pass, deterministic scheduling, and
// final kit validation (Phases 5-7). No business logic is reimplemented
// here; this function exists only so the batch evaluator and the HTTP
// controller share one call sequence instead of two independent ones.
export async function runCasePipeline(input: RunCasePipelineInput): Promise<DraftKit> {
  const research = await researchCompany(input.companyUrl, {
    allowLocalTargets: env.ALLOW_LOCAL_RESEARCH_TARGETS,
  });

  return generateDraftKit({
    jobDescription: input.jobDescription,
    companyUrl: input.companyUrl,
    daysAvailable: input.daysAvailable,
    research,
  });
}
