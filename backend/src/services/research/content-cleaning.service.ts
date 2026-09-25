import * as cheerio from "cheerio";

const NOISE_SELECTORS = [
  "script",
  "style",
  "noscript",
  "svg",
  "iframe",
  "form",
  "button",
  "input",
  "[class*='cookie']",
  "[id*='cookie']",
  "[class*='consent']",
  "[id*='consent']",
];

// Bounds the text handed to later LLM prompts/storage; a single page's
// content is a summarisation input, not a document to reproduce verbatim.
const MAX_TEXT_LENGTH = 20_000;

export interface CleanedContent {
  title: string;
  text: string;
}

// Deterministic HTML -> text extraction: strips script/style/cookie-banner
// noise and keeps heading/paragraph/list text as line-delimited blocks so
// structure survives for a later LLM prompt.
export function cleanHtml(html: string): CleanedContent {
  const $ = cheerio.load(html);
  NOISE_SELECTORS.forEach((selector) => $(selector).remove());

  const title = $("title").first().text().trim() || $("h1").first().text().trim();

  const blocks: string[] = [];
  $("h1, h2, h3, h4, h5, h6, p, li").each((_, element) => {
    const text = $(element).text().trim().replace(/\s+/g, " ");
    if (text) {
      blocks.push(text);
    }
  });

  return { title, text: blocks.join("\n").slice(0, MAX_TEXT_LENGTH) };
}
