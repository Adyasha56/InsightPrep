import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { sendSuccess } from "../utils/apiResponse";
import { researchCompany } from "../services/research/company-research.service";
import { env } from "../config/env";

// Development/testing endpoint for the retrieval pipeline. Not used by the
// kit-generation flow yet — see RULES.md phase notes.
export const researchCompanyEndpoint = asyncHandler(async (req: Request, res: Response) => {
  const { company_url: companyUrl } = req.body;
  const result = await researchCompany(companyUrl, { allowLocalTargets: env.ALLOW_LOCAL_RESEARCH_TARGETS });
  sendSuccess(res, result);
});
