import { DiscoveredLink, RankedLink, ResearchSourceType } from "../../types/research.types";

// Signals are deliberately broad rather than a fixed allowlist of paths —
// per RULES.md, a page like "/life-at-company" or "/inside-engineering"
// must still be discoverable through keyword matching, not hard-coded routes.
// Plural/suffixed variants (e.g. "careers", "jobs") are deliberately left
// out where the singular form is already a substring match — including
// both would double-count the same link.
const HIRING_SIGNALS = [
  "career", "job", "hiring", "recruit", "recruiting",
  "recruitment", "interview", "handbook", "talent", "culture", "working",
  "life-at", "people", "join-us", "joinus",
];
const COMPANY_SIGNALS = ["about", "company", "product", "platform", "solutions", "technology", "team"];
const ENGINEERING_SIGNALS = ["engineering", "blog", "tech-blog", "techblog"];
const NEGATIVE_SIGNALS = [
  "login", "signin", "sign-in", "logout", "signout", "sign-out", "register",
  "account", "cart", "checkout", "privacy", "terms", "cookie", "legal",
  "press", "investor", "support", "help", "contact", "download",
  ".pdf", ".zip", ".jpg", ".jpeg", ".png", ".svg", ".css", ".js", ".ico",
];

function countMatches(haystack: string, signals: string[]): number {
  return signals.filter((signal) => haystack.includes(signal)).length;
}

function linkHaystack(link: Pick<DiscoveredLink, "url" | "text">): string {
  let path = "";
  try {
    path = new URL(link.url).pathname.toLowerCase();
  } catch {
    path = "";
  }
  return `${path} ${link.text.toLowerCase()}`;
}

// Hiring signals outweigh generic company signals so the bounded crawl
// budget prioritises finding interview-relevant pages first; off-site and
// deeply nested links are penalised since they're less likely to be primary
// navigation the company intends visitors to find.
export function scoreLink(link: DiscoveredLink): number {
  const haystack = linkHaystack(link);

  let score = 0;
  score += countMatches(haystack, HIRING_SIGNALS) * 6;
  score += countMatches(haystack, COMPANY_SIGNALS) * 4;
  score += countMatches(haystack, ENGINEERING_SIGNALS) * 3;
  score -= countMatches(haystack, NEGATIVE_SIGNALS) * 8;
  score += link.isSameSite ? 2 : -6;

  const pathDepth = new URL(link.url).pathname.split("/").filter(Boolean).length;
  score -= pathDepth;

  return score;
}

export function rankLinks(links: DiscoveredLink[]): RankedLink[] {
  return links.map((link) => ({ ...link, score: scoreLink(link) })).sort((a, b) => b.score - a.score);
}

export function classifySourceType(url: string, anchorText: string): ResearchSourceType {
  const haystack = linkHaystack({ url, text: anchorText });

  if (countMatches(haystack, HIRING_SIGNALS) > 0) return "careers";
  if (countMatches(haystack, ENGINEERING_SIGNALS) > 0) return "engineering";
  if (countMatches(haystack, COMPANY_SIGNALS) > 0) {
    const isProductLike = ["product", "products", "platform", "solutions"].some((kw) => haystack.includes(kw));
    return isProductLike ? "product" : "about";
  }
  return "other";
}
