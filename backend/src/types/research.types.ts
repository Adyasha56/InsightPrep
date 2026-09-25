export type ResearchSourceType = "homepage" | "about" | "product" | "careers" | "engineering" | "other";

export type FetchFailureReason =
  | "INVALID_URL"
  | "TIMEOUT"
  | "CONNECTION_ERROR"
  | "HTTP_ERROR"
  | "RESPONSE_TOO_LARGE"
  | "UNSUPPORTED_CONTENT_TYPE"
  | "BLOCKED_BY_ROBOTS";

export interface FetchSuccess {
  ok: true;
  requestedUrl: string;
  finalUrl: string;
  status: number;
  contentType: string;
  html: string;
}

export interface FetchFailure {
  ok: false;
  requestedUrl: string;
  reason: FetchFailureReason;
  message: string;
  status?: number;
}

export type FetchResult = FetchSuccess | FetchFailure;

// A link discovered on a page, before ranking. `isSameSite` and
// `text` are the raw signals the ranking service scores.
export interface DiscoveredLink {
  url: string;
  text: string;
  isSameSite: boolean;
}

export interface RankedLink extends DiscoveredLink {
  score: number;
}

export interface PageResearchResult {
  url: string;
  title: string;
  status: number;
  contentType: string;
  text: string;
  links: string[];
  fetchedAt: string;
  sourceType: ResearchSourceType;
}

export interface ResearchFailure {
  url: string;
  status: "failed";
  reason: FetchFailureReason;
  message: string;
}

export type CompanyResearchStatus = "success" | "partial" | "failed";

export interface CompanyResearchResult {
  companyUrl: string;
  finalUrl: string | null;
  status: CompanyResearchStatus;
  pages: PageResearchResult[];
  pagesUsed: number;
  companyPages: PageResearchResult[];
  hiringPages: PageResearchResult[];
  failures: ResearchFailure[];
  warnings: string[];
  fetchedAt: string;
}
