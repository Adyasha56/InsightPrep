const SUPPORTED_PROTOCOLS = new Set(["http:", "https:"]);

// Schemes that are technically valid anchors but never something a
// research crawler should fetch.
export function isSupportedScheme(url: string): boolean {
  try {
    return SUPPORTED_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

export function resolveUrl(base: string, href: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

// Strips the fragment and default ports so equivalent URLs collapse to the
// same key. Query strings are dropped entirely: for company-research pages
// they are almost always tracking/pagination noise rather than content that
// changes what's on the page, and stripping them meaningfully reduces
// duplicate-page crawling within the page budget.
export function normalizeUrl(url: string): string {
  const parsed = new URL(url);
  parsed.hash = "";
  parsed.search = "";

  const isDefaultPort =
    (parsed.protocol === "http:" && parsed.port === "80") ||
    (parsed.protocol === "https:" && parsed.port === "443");
  if (isDefaultPort) {
    parsed.port = "";
  }

  parsed.hostname = parsed.hostname.toLowerCase();

  if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
    parsed.pathname = parsed.pathname.slice(0, -1);
  }

  return parsed.toString();
}

export function dedupeUrls<T extends { url: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const item of items) {
    const key = normalizeUrl(item.url);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }

  return result;
}

// Naive registrable-domain heuristic (last two labels). There is no public
// suffix list dependency here, so multi-part TLDs like "co.uk" are not
// handled precisely — see README known limitations.
export function getRegistrableDomain(hostname: string): string {
  const labels = hostname.toLowerCase().split(".").filter(Boolean);
  return labels.slice(-2).join(".");
}

export function isSameSite(hostnameA: string, hostnameB: string): boolean {
  return getRegistrableDomain(hostnameA) === getRegistrableDomain(hostnameB);
}
