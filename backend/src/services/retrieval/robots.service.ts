import { fetchUrl } from "./http-client.service";

interface RobotsRule {
  path: string;
  allow: boolean;
}

export interface RobotsRules {
  rules: RobotsRule[];
}

const ALLOW_ALL: RobotsRules = { rules: [] };

// Caller-scoped cache (one per research request) so robots.txt is fetched
// at most once per domain per crawl, per rule 5.
export type RobotsCache = Map<string, RobotsRules>;

export function createRobotsCache(): RobotsCache {
  return new Map();
}

export async function getRobotsRules(origin: string, cache: RobotsCache): Promise<RobotsRules> {
  const cached = cache.get(origin);
  if (cached) {
    return cached;
  }

  const result = await fetchUrl(`${origin}/robots.txt`, {
    maxRetries: 0,
    acceptedContentTypes: ["text/plain", "text/html"],
  });

  // A missing or unreachable robots.txt is treated as "allow all" — the
  // same deliberate default real crawlers use, since its absence is not a
  // signal that the site owner intended to restrict anything.
  const rules = result.ok ? parseRobotsTxt(result.html) : ALLOW_ALL;
  cache.set(origin, rules);
  return rules;
}

// Only the wildcard ("*") user-agent group is respected. Sites that carve
// out rules for specific named crawlers (e.g. "Googlebot") fall back to
// this bot's default group, matching how most non-major crawlers behave.
function parseRobotsTxt(text: string): RobotsRules {
  const rules: RobotsRule[] = [];
  let inWildcardGroup = false;
  let groupHasDirectives = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;

    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) continue;

    const directive = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();

    if (directive === "user-agent") {
      if (groupHasDirectives) {
        inWildcardGroup = false;
        groupHasDirectives = false;
      }
      if (value === "*") {
        inWildcardGroup = true;
      }
      continue;
    }

    if (directive === "disallow" || directive === "allow") {
      groupHasDirectives = true;
      if (inWildcardGroup && value !== "") {
        rules.push({ path: value, allow: directive === "allow" });
      }
    }
  }

  return { rules };
}

// Longest matching prefix wins, per the de facto robots.txt convention;
// no matching rule means the path is allowed by default.
export function isPathAllowed(rules: RobotsRules, pathname: string): boolean {
  let best: RobotsRule | null = null;

  for (const rule of rules.rules) {
    if (pathname.startsWith(rule.path) && (!best || rule.path.length > best.path.length)) {
      best = rule;
    }
  }

  return best ? best.allow : true;
}
