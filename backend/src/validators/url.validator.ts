import { z } from "zod";

// Only checks shape at the API boundary. Protocol/SSRF/reachability
// validation belongs to services/retrieval/url-validation.service.ts, since
// that requires DNS resolution and IP classification, not just string shape.
export const companyResearchRequestSchema = z.object({
  company_url: z.string().trim().min(1, "company_url is required."),
});

export type CompanyResearchRequestInput = z.infer<typeof companyResearchRequestSchema>;
