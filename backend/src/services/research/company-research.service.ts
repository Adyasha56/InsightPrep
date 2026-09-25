import { env } from "../../config/env";
import { sleep } from "../../utils/sleep.util";
import { normalizeUrl } from "../../utils/url.utils";
import { validateCompanyUrl } from "../retrieval/url-validation.service";
import { fetchUrl } from "../retrieval/http-client.service";
import { createRobotsCache, getRobotsRules, isPathAllowed, RobotsCache } from "../retrieval/robots.service";
import { extractLinks } from "./link-extraction.service";
import { rankLinks, classifySourceType } from "./link-ranking.service";
import { cleanHtml } from "./content-cleaning.service";
import {
  CompanyResearchResult,
  CompanyResearchStatus,
  DiscoveredLink,
  FetchResult,
  FetchSuccess,
  PageResearchResult,
  RankedLink,
  ResearchFailure,
  ResearchSourceType,
} from "../../types/research.types";

export interface ResearchCompanyOptions {
  allowLocalTargets?: boolean;
}

// Orchestrates a bounded, prioritised crawl: fetch the homepage, rank the
// links it exposes, then fetch the highest-value candidates first so the
// page budget is spent on hiring/company content rather than DOM order.
export async function researchCompany(
  companyUrl: string,
  options: ResearchCompanyOptions = {}
): Promise<CompanyResearchResult> {
  const fetchedAt = new Date().toISOString();
  const validatedUrl = await validateCompanyUrl(companyUrl, options);

  const robotsCache = createRobotsCache();
  const visited = new Set<string>();
  const pages: PageResearchResult[] = [];
  const failures: ResearchFailure[] = [];
  const warnings: string[] = [];

  const homepageResult = await fetchPage(validatedUrl.toString(), robotsCache);

  if (!homepageResult.ok) {
    failures.push(toResearchFailure(homepageResult));
    return buildResult({ companyUrl, finalUrl: null, status: "failed", pages, failures, warnings, fetchedAt });
  }

  visited.add(normalizeUrl(homepageResult.finalUrl));
  pages.push(buildPageResult(homepageResult, "homepage"));

  let candidates: RankedLink[] = rankLinks(sameSiteOnly(extractLinks(homepageResult.html, homepageResult.finalUrl)));
  let depth = 1;

  while (pages.length < env.CRAWLER_MAX_PAGES && candidates.length > 0 && depth <= env.CRAWLER_MAX_DEPTH) {
    const discoveredNext: DiscoveredLink[] = [];

    for (const candidate of candidates) {
      if (pages.length >= env.CRAWLER_MAX_PAGES) break;

      const key = normalizeUrl(candidate.url);
      if (visited.has(key)) continue;
      visited.add(key);

      await sleep(env.CRAWLER_REQUEST_DELAY_MS);
      const result = await fetchPage(candidate.url, robotsCache);

      if (!result.ok) {
        failures.push(toResearchFailure(result));
        continue;
      }

      const sourceType = classifySourceType(result.finalUrl, candidate.text);
      pages.push(buildPageResult(result, sourceType));

      if (depth < env.CRAWLER_MAX_DEPTH) {
        discoveredNext.push(...sameSiteOnly(extractLinks(result.html, result.finalUrl)));
      }
    }

    candidates = rankLinks(discoveredNext).filter((link) => !visited.has(normalizeUrl(link.url)));
    depth += 1;
  }

  const hiringPages = pages.filter((page) => page.sourceType === "careers");
  if (hiringPages.length === 0) {
    // Explicit assessment case: a missing hiring page is represented
    // honestly rather than fabricated, and does not fail the research.
    warnings.push("No hiring/careers page was found; hiring information is unavailable for this company.");
  }

  const status: CompanyResearchStatus = failures.length === 0 ? "success" : "partial";

  return buildResult({
    companyUrl,
    finalUrl: homepageResult.finalUrl,
    status,
    pages,
    failures,
    warnings,
    fetchedAt,
  });
}

function sameSiteOnly(links: DiscoveredLink[]): DiscoveredLink[] {
  return links.filter((link) => link.isSameSite);
}

async function fetchPage(url: string, robotsCache: RobotsCache): Promise<FetchResult> {
  const parsed = new URL(url);
  const origin = `${parsed.protocol}//${parsed.host}`;
  const robotsRules = await getRobotsRules(origin, robotsCache);

  if (!isPathAllowed(robotsRules, parsed.pathname)) {
    return {
      ok: false,
      requestedUrl: url,
      reason: "BLOCKED_BY_ROBOTS",
      message: "Path disallowed by robots.txt.",
    };
  }

  return fetchUrl(url);
}

function buildPageResult(result: FetchSuccess, sourceType: ResearchSourceType): PageResearchResult {
  const cleaned = cleanHtml(result.html);
  const links = extractLinks(result.html, result.finalUrl).map((link) => link.url);

  return {
    url: result.finalUrl,
    title: cleaned.title,
    status: result.status,
    contentType: result.contentType,
    text: cleaned.text,
    links,
    fetchedAt: new Date().toISOString(),
    sourceType,
  };
}

function toResearchFailure(failure: Extract<FetchResult, { ok: false }>): ResearchFailure {
  return { url: failure.requestedUrl, status: "failed", reason: failure.reason, message: failure.message };
}

interface BuildResultInput {
  companyUrl: string;
  finalUrl: string | null;
  status: CompanyResearchStatus;
  pages: PageResearchResult[];
  failures: ResearchFailure[];
  warnings: string[];
  fetchedAt: string;
}

function buildResult(input: BuildResultInput): CompanyResearchResult {
  return {
    companyUrl: input.companyUrl,
    finalUrl: input.finalUrl,
    status: input.status,
    pages: input.pages,
    pagesUsed: input.pages.length,
    companyPages: input.pages.filter((page) => page.sourceType === "about" || page.sourceType === "product"),
    hiringPages: input.pages.filter((page) => page.sourceType === "careers"),
    failures: input.failures,
    warnings: input.warnings,
    fetchedAt: input.fetchedAt,
  };
}
