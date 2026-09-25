import { describe, expect, it } from "vitest";
import { cleanHtml } from "../../src/services/research/content-cleaning.service";

describe("cleanHtml", () => {
  it("strips scripts, styles, and cookie-banner markup", () => {
    const html = `
      <html>
        <head><title>Example Co</title><style>body { color: red; }</style></head>
        <body>
          <script>window.alert("hi")</script>
          <div class="cookie-banner">We use cookies</div>
          <h1>Welcome to Example Co</h1>
          <p>We build great products.</p>
          <ul><li>Health insurance</li><li>Remote friendly</li></ul>
        </body>
      </html>`;

    const result = cleanHtml(html);

    expect(result.title).toBe("Example Co");
    expect(result.text).not.toContain("window.alert");
    expect(result.text).not.toContain("color: red");
    expect(result.text).not.toContain("We use cookies");
    expect(result.text).toContain("Welcome to Example Co");
    expect(result.text).toContain("We build great products.");
    expect(result.text).toContain("Health insurance");
  });

  it("falls back to the first heading when there is no title tag", () => {
    const result = cleanHtml("<html><body><h1>Untitled Co</h1><p>Hello</p></body></html>");
    expect(result.title).toBe("Untitled Co");
  });
});
