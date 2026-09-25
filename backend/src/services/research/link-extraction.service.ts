import * as cheerio from "cheerio";
import { dedupeUrls, isSameSite, isSupportedScheme, normalizeUrl, resolveUrl } from "../../utils/url.utils";
import { DiscoveredLink } from "../../types/research.types";

// Pulls anchors out of a page's HTML and reduces them to the deduped,
// same-scheme, absolute-URL candidates the ranking service can score.
// Deliberately does not filter by domain/topic — that is link-ranking's job.
export function extractLinks(html: string, pageUrl: string): DiscoveredLink[] {
  const $ = cheerio.load(html);
  const pageHostname = new URL(pageUrl).hostname;
  const links: DiscoveredLink[] = [];

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;

    const resolved = resolveUrl(pageUrl, href);
    if (!resolved || !isSupportedScheme(resolved)) return;

    let hostname: string;
    try {
      hostname = new URL(resolved).hostname;
    } catch {
      return;
    }

    links.push({
      url: normalizeUrl(resolved),
      text: $(element).text().trim().replace(/\s+/g, " ").slice(0, 200),
      isSameSite: isSameSite(hostname, pageHostname),
    });
  });

  return dedupeUrls(links);
}
