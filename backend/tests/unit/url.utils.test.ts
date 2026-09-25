import { describe, expect, it } from "vitest";
import { dedupeUrls, isSupportedScheme, normalizeUrl, resolveUrl } from "../../src/utils/url.utils";

describe("resolveUrl", () => {
  it("resolves a relative URL against the page it was found on", () => {
    expect(resolveUrl("https://example.com/careers/", "../about")).toBe("https://example.com/about");
    expect(resolveUrl("https://example.com", "/jobs")).toBe("https://example.com/jobs");
  });

  it("returns null for an unresolvable href", () => {
    expect(resolveUrl("https://example.com", "http://")).toBeNull();
  });
});

describe("normalizeUrl", () => {
  it("strips fragments and query strings", () => {
    expect(normalizeUrl("https://example.com/about?ref=nav#team")).toBe("https://example.com/about");
  });

  it("collapses default ports and a trailing slash", () => {
    expect(normalizeUrl("https://Example.com:443/careers/")).toBe("https://example.com/careers");
  });
});

describe("isSupportedScheme", () => {
  it("accepts http and https", () => {
    expect(isSupportedScheme("https://example.com")).toBe(true);
    expect(isSupportedScheme("http://example.com")).toBe(true);
  });

  it("rejects mailto, tel, and javascript links", () => {
    expect(isSupportedScheme("mailto:jobs@example.com")).toBe(false);
    expect(isSupportedScheme("tel:+1234567890")).toBe(false);
    expect(isSupportedScheme("javascript:void(0)")).toBe(false);
  });
});

describe("dedupeUrls", () => {
  it("removes duplicates that normalize to the same URL", () => {
    const result = dedupeUrls([
      { url: "https://example.com/about" },
      { url: "https://example.com/about/" },
      { url: "https://example.com/about?ref=footer#section" },
      { url: "https://example.com/careers" },
    ]);

    expect(result).toHaveLength(2);
  });
});
