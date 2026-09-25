import { describe, expect, it } from "vitest";
import { classifySourceType, rankLinks } from "../../src/services/research/link-ranking.service";
import { DiscoveredLink } from "../../src/types/research.types";

function link(url: string, text: string, isSameSite = true): DiscoveredLink {
  return { url, text, isSameSite };
}

describe("rankLinks", () => {
  it("ranks hiring-related links above company/about links", () => {
    const ranked = rankLinks([
      link("https://example.com/careers", "Careers"),
      link("https://example.com/about", "About us"),
    ]);

    expect(ranked[0].url).toBe("https://example.com/careers");
  });

  it("ranks company/about links above unrelated links", () => {
    const ranked = rankLinks([
      link("https://example.com/privacy", "Privacy Policy"),
      link("https://example.com/about", "About us"),
    ]);

    expect(ranked[0].url).toBe("https://example.com/about");
  });

  it("deprioritises login/account/asset links", () => {
    const ranked = rankLinks([
      link("https://example.com/login", "Log in"),
      link("https://example.com/engineering", "Engineering"),
    ]);

    expect(ranked[0].url).toBe("https://example.com/engineering");
    expect(ranked.find((l) => l.url.endsWith("/login"))!.score).toBeLessThan(0);
  });

  it("deprioritises off-domain links relative to same-site links", () => {
    const ranked = rankLinks([
      link("https://unrelated.com/careers", "Careers", false),
      link("https://example.com/other", "Other", true),
    ]);

    expect(ranked[0].url).toBe("https://example.com/other");
  });
});

describe("classifySourceType", () => {
  it("classifies hiring pages as careers", () => {
    expect(classifySourceType("https://example.com/careers", "Careers")).toBe("careers");
  });

  it("classifies product pages distinctly from about pages", () => {
    expect(classifySourceType("https://example.com/product", "Product")).toBe("product");
    expect(classifySourceType("https://example.com/about", "About")).toBe("about");
  });

  it("falls back to 'other' when no signal matches", () => {
    expect(classifySourceType("https://example.com/xyz123", "Random")).toBe("other");
  });
});
