import axios from "axios";
import * as cheerio from "cheerio";
import pLimit from "p-limit";
import { URL } from "url";
import Anthropic from "@anthropic-ai/sdk";
import type { Cheerio, CheerioAPI } from "cheerio";
import type { Element } from "domhandler";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? "",
});

export const MAX_PAGES = 200;
export const CRAWL_BATCH_SIZE = 5;
export const PAGE_BATCH_SIZE = 3;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_QUEUE_MULTIPLIER = 3;
const MIN_PAGE_TEXT_LENGTH = 120;

export type PageType = "documentation" | "faq" | "feature" | "pricing" | "blog" | "general";

export interface KnowledgeBaseSection {
  heading: string;
  content: string;
}

export interface KnowledgeBaseItem {
  url: string;
  title: string;
  pageType: PageType;
  headings: string[];
  cleanText: string;
  sections: KnowledgeBaseSection[];
}

export interface ProductSummary {
  productName: string;
  oneSentenceSummary: string;
  whatItDoes: string;
  targetUsers: string[];
}

export interface Feature {
  name: string;
  description: string;
  evidence: string[];
}

export interface UseCase {
  title: string;
  description: string;
}

export interface HowTo {
  title: string;
  steps: string[];
}

export interface RefinedKnowledgeBatch {
  productSummary: ProductSummary;
  features: Feature[];
  useCases: UseCase[];
  howTos: HowTo[];
  openQuestions: string[];
}

export interface CrawlBatchResult {
  crawled: KnowledgeBaseItem[];
  discoveredLinks: string[];
}

const SKIP_EXTENSIONS = [
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp", ".ico",
  ".avif", ".pdf", ".zip", ".rar", ".7z", ".tar", ".gz", ".mp4",
  ".webm", ".mov", ".avi", ".mp3", ".wav", ".doc", ".docx", ".xls",
  ".xlsx", ".ppt", ".pptx", ".xml", ".json", ".csv", ".txt",
] as const;

const SKIP_PATH_PATTERNS = [
  "/wp-json/", "/wp-admin/", "/wp-content/", "/feed", "/cart", "/checkout", "/account",
] as const;

const refineBatchTool = {
  name: "extract_kb_signals",
  description: "Extract concise documentation signals from crawled website pages.",
  input_schema: {
    type: "object",
    properties: {
      productSummary: {
        type: "object",
        properties: {
          productName: { type: "string" },
          oneSentenceSummary: { type: "string" },
          whatItDoes: { type: "string" },
          targetUsers: { type: "array", items: { type: "string" } },
        },
        required: ["productName", "oneSentenceSummary", "whatItDoes", "targetUsers"],
        additionalProperties: false,
      },
      features: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            evidence: { type: "array", items: { type: "string" } },
          },
          required: ["name", "description", "evidence"],
          additionalProperties: false,
        },
      },
      useCases: {
        type: "array",
        items: {
          type: "object",
          properties: { title: { type: "string" }, description: { type: "string" } },
          required: ["title", "description"],
          additionalProperties: false,
        },
      },
      howTos: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            steps: { type: "array", items: { type: "string" } },
          },
          required: ["title", "steps"],
          additionalProperties: false,
        },
      },
      openQuestions: { type: "array", items: { type: "string" } },
    },
    required: ["productSummary", "features", "useCases", "howTos", "openQuestions"],
    additionalProperties: false,
  },
  strict: true,
} as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

export function normalizeUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    url.hash = "";
    for (const p of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"]) {
      url.searchParams.delete(p);
    }
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return null;
  }
}

export function getDomain(url: string): string {
  return new URL(url).hostname;
}

function isSameDomain(url: string, baseDomain: string): boolean {
  try { return getDomain(url) === baseDomain; } catch { return false; }
}

function hasSkippableExtension(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return SKIP_EXTENSIONS.some((ext) => pathname.endsWith(ext));
  } catch { return true; }
}

function shouldSkipUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const lowerPath = parsed.pathname.toLowerCase();
    if (!["http:", "https:"].includes(parsed.protocol)) return true;
    if (hasSkippableExtension(url)) return true;
    if (SKIP_PATH_PATTERNS.some((p) => lowerPath.includes(p))) return true;
    return false;
  } catch { return true; }
}

function isHtmlResponse(contentType: string | undefined): boolean {
  return (contentType ?? "").toLowerCase().includes("text/html");
}

function cleanText(text: string): string {
  return text.replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
}

function isJunkLine(line: string): boolean {
  if (line.length < 2) return true;
  if (/^(skip to content|scroll to top)$/i.test(line)) return true;
  if (/^(get started|get contentgate|join waitlist|email|message|learn more)$/i.test(line)) return true;
  if (/^\d+$/.test(line)) return true;
  if (/^(∞|100%|2 min|0)$/i.test(line)) return true;
  if (/^[#>*\-\s]+$/.test(line)) return true;
  return false;
}

function dedupeLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of lines) {
    const line = cleanText(raw);
    const key = line.toLowerCase();
    if (!line || isJunkLine(line)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(line);
  }
  return result;
}

function removeBoilerplate($: CheerioAPI): void {
  $([
    "script", "style", "noscript", "iframe", "svg", "canvas", "img", "picture",
    "source", "video", "audio", "form", "input", "textarea", "button", "select",
    "label", "nav", "footer", "header", "aside",
    ".menu", ".nav", ".navbar", ".footer", ".header", ".sidebar", ".popup",
    ".modal", ".cookie", ".breadcrumbs", ".social", ".share", ".newsletter",
    ".subscribe", ".comment", ".comments", ".related", ".recommended",
    ".cta", ".hero-form", "#comments",
  ].join(",")).remove();
}

function isElement(node: unknown): node is Element {
  return isRecord(node) && typeof (node as unknown as Element).tagName === "string";
}

function scoreNode($: CheerioAPI, el: Element): number {
  const node = $(el);
  const text = cleanText(node.text());
  if (!text) return 0;
  let score = text.length;
  score += node.find("p").length * 80;
  score += node.find("li").length * 40;
  score += node.find("h1,h2,h3,h4").length * 30;
  const classId = `${node.attr("class") ?? ""} ${node.attr("id") ?? ""}`.toLowerCase();
  if (/content|article|post|entry|main|doc|page|section/.test(classId)) score += 300;
  if (/footer|header|nav|menu|sidebar|popup|modal|comment|share|related/.test(classId)) score -= 500;
  return score;
}

function pickMainContent($: CheerioAPI): Cheerio<Element> {
  const candidates = ["main", "article", "[role='main']", ".content", ".entry-content",
    ".post-content", ".page-content", ".site-main", "section"];
  let best: Element | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const selector of candidates) {
    $(selector).each((_, el) => {
      if (!isElement(el)) return;
      const score = scoreNode($, el);
      if (score > bestScore) { bestScore = score; best = el; }
    });
  }
  if (best === null) {
    $("div").each((_, el) => {
      if (!isElement(el)) return;
      const score = scoreNode($, el);
      if (score > bestScore) { bestScore = score; best = el; }
    });
  }
  return best ? $(best) : $("body");
}

function extractSections(root: Cheerio<Element>, $: CheerioAPI): KnowledgeBaseSection[] {
  const sections: Array<{ heading: string; content: string[] }> = [];
  let current: { heading: string; content: string[] } | null = null;
  root.children().each((_, el) => {
    const tagName = el.tagName.toLowerCase();
    const node = $(el);
    if (/^h[1-4]$/.test(tagName)) {
      const heading = cleanText(node.text());
      if (!heading || isJunkLine(heading)) return;
      current = { heading, content: [] };
      sections.push(current);
      return;
    }
    const text = cleanText(node.text());
    if (!text || isJunkLine(text)) return;
    if (current === null) { current = { heading: "Overview", content: [] }; sections.push(current); }
    current.content.push(text);
  });
  return sections
    .map((s) => ({ heading: s.heading, content: dedupeLines(s.content).join("\n") }))
    .filter((s) => s.content.length > 0);
}

function classifyPage(url: string, title: string, headings: string[]): PageType {
  const blob = `${url} ${title} ${headings.join(" ")}`.toLowerCase();
  if (/docs|documentation|help|knowledge-base/.test(blob)) return "documentation";
  if (/faq/.test(blob)) return "faq";
  if (/feature|features/.test(blob)) return "feature";
  if (/pricing|price/.test(blob)) return "pricing";
  if (/blog|article|news/.test(blob)) return "blog";
  return "general";
}

export function chunkArray<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

export function stripLargeFields(page: KnowledgeBaseItem): KnowledgeBaseItem {
  return {
    url: page.url,
    title: page.title,
    pageType: page.pageType,
    headings: page.headings.slice(0, 20),
    sections: page.sections.slice(0, 20).map((s) => ({ heading: s.heading, content: s.content.slice(0, 4000) })),
    cleanText: page.cleanText.slice(0, 8000),
  };
}

function extractLinks($: CheerioAPI, currentUrl: string, baseDomain: string): string[] {
  const discovered: string[] = [];
  $("a[href]").each((_, el) => {
    const href = ($(el).attr("href") ?? "").trim();
    if (!href || href.startsWith("#") || href.startsWith("mailto:") ||
        href.startsWith("tel:") || href.startsWith("javascript:")) return;
    let absolute: string;
    try { absolute = new URL(href, currentUrl).href; } catch { return; }
    const normalized = normalizeUrl(absolute);
    if (normalized === null) return;
    if (!isSameDomain(normalized, baseDomain)) return;
    if (shouldSkipUrl(normalized)) return;
    discovered.push(normalized);
  });
  return [...new Set(discovered)];
}

// ── Type guards ───────────────────────────────────────────────────────────────

function isFeature(v: unknown): v is Feature {
  return isRecord(v) && isString(v.name) && isString(v.description) && isStringArray(v.evidence);
}

function isUseCase(v: unknown): v is UseCase {
  return isRecord(v) && isString(v.title) && isString(v.description);
}

function isHowTo(v: unknown): v is HowTo {
  return isRecord(v) && isString(v.title) && isStringArray(v.steps);
}

function isProductSummary(v: unknown): v is ProductSummary {
  return isRecord(v) && isString(v.productName) && isString(v.oneSentenceSummary) &&
    isString(v.whatItDoes) && isStringArray(v.targetUsers);
}

function isRefinedKnowledgeBatch(v: unknown): v is RefinedKnowledgeBatch {
  return isRecord(v) && isProductSummary(v.productSummary) &&
    Array.isArray(v.features) && v.features.every(isFeature) &&
    Array.isArray(v.useCases) && v.useCases.every(isUseCase) &&
    Array.isArray(v.howTos) && v.howTos.every(isHowTo) &&
    isStringArray(v.openQuestions);
}

function getToolInput(response: unknown, toolName: string): unknown {
  if (!isRecord(response) || !Array.isArray(response.content)) {
    throw new Error(`Claude did not call required tool: ${toolName}`);
  }
  const block = (response.content as unknown[]).find(
    (b): b is { type: "tool_use"; name: string; input: unknown } =>
      isRecord(b) && b.type === "tool_use" && b.name === toolName
  );
  if (!block) throw new Error(`Claude did not call required tool: ${toolName}`);
  return block.input;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Crawl a batch of URLs in parallel. Returns extracted pages and discovered links. */
export async function crawlPageBatch(
  urls: string[],
  baseDomain: string,
  visitedSet: Set<string>,
): Promise<CrawlBatchResult> {
  const limit = pLimit(CRAWL_BATCH_SIZE);
  const allLinks: string[] = [];
  const crawled: KnowledgeBaseItem[] = [];

  await Promise.all(
    urls.map((url) =>
      limit(async () => {
        if (visitedSet.has(url) || shouldSkipUrl(url)) return;
        try {
          const response = await axios.get<string>(url, {
            timeout: REQUEST_TIMEOUT_MS,
            maxRedirects: 5,
            headers: { "User-Agent": "Mozilla/5.0 (compatible; KB-Crawler/3.0)" },
            validateStatus: (s) => s >= 200 && s < 400,
            responseType: "text",
          });
          const contentType = response.headers["content-type"];
          if (!isHtmlResponse(contentType) || typeof response.data !== "string") return;

          const html = response.data;
          const link$ = cheerio.load(html);
          allLinks.push(...extractLinks(link$, url, baseDomain));

          const $ = cheerio.load(html);
          removeBoilerplate($);
          const title = cleanText($("title").first().text());
          const mainRoot = pickMainContent($);
          const rootHtml = mainRoot.html() ?? "";
          const local$ = cheerio.load(`<div id="root">${rootHtml}</div>`);
          removeBoilerplate(local$);
          const root = local$("#root");

          const headings = dedupeLines(root.find("h1,h2,h3").map((_, el) => local$(el).text()).get());
          const sections = extractSections(root, local$);
          const cleanBody = dedupeLines(
            root.text().split("\n").map((line) => cleanText(line))
          ).join("\n");

          if (cleanBody.length >= MIN_PAGE_TEXT_LENGTH) {
            crawled.push({ url, title, pageType: classifyPage(url, title, headings), headings, cleanText: cleanBody, sections });
          }
        } catch {
          // Silently skip failed pages
        }
      })
    )
  );

  return { crawled, discoveredLinks: [...new Set(allLinks)] };
}

/** Refine one batch of raw pages using Claude. */
export async function refineBatch(
  pages: KnowledgeBaseItem[],
  batchNumber: number,
  totalBatches: number,
): Promise<RefinedKnowledgeBatch> {
  console.log(`Refining batch ${batchNumber}/${totalBatches}...`);
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 4000,
    temperature: 0,
    tools: [{
      ...refineBatchTool,
      input_schema: { ...refineBatchTool.input_schema, required: [...refineBatchTool.input_schema.required] },
    }],
    tool_choice: { type: "tool", name: "extract_kb_signals" },
    messages: [{
      role: "user",
      content: `Refine these crawled website pages into a documentation-ready knowledge base batch.\n\nRules:\n- Use only the provided input.\n- Remove boilerplate and repeated marketing CTA language.\n- Do not invent unsupported product behavior.\n- Capture product, features, use cases, terminology, and how-to guidance.\n- Put uncertainty into openQuestions.\n\nInput pages:\n${JSON.stringify(pages)}`.trim(),
    }],
  });
  const toolInput = getToolInput(response, "extract_kb_signals");
  if (!isRefinedKnowledgeBatch(toolInput)) throw new Error("Claude returned invalid structured tool output.");
  return toolInput;
}
