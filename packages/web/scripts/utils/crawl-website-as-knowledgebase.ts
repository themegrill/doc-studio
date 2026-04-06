import path from "path";
import fs from "fs";
import axios from "axios";
import * as cheerio from "cheerio";
import pLimit from "p-limit";
import { URL } from "url";
import Anthropic from "@anthropic-ai/sdk";
import postgres from "postgres";
import type { Cheerio, CheerioAPI } from "cheerio";
import type { Element } from "domhandler";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? "",
});

const START_URL = process.argv[2] ?? "";
const KB_DIR = process.argv[3] ?? "knowledge-base";
const PROJECT_SLUG = process.argv[4] ?? "";
const PROGRESS_PATH = path.join(KB_DIR, "crawl-progress.json");
const PID_PATH = path.join(KB_DIR, "crawl-pid.txt");
const LOG_PATH = path.join(KB_DIR, "crawl-log.txt");
const RAW_KB_PATH = path.join(KB_DIR, "knowledge-base.raw.json");

const MAX_PAGES = 200;
const CONCURRENCY = 5;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_QUEUE_MULTIPLIER = 3;
const MIN_PAGE_TEXT_LENGTH = 120;
const PAGE_BATCH_SIZE = 3;

type ProgressStatus = "crawling" | "refining" | "done" | "error";

interface ProgressData {
  status: ProgressStatus;
  visitedPages: number;
  maxPages: number;
  currentBatch: number;
  totalBatches: number;
  progress: number;
  message: string;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}

interface KnowledgeBaseSection {
  heading: string;
  content: string;
}

interface KnowledgeBaseItem {
  url: string;
  title: string;
  pageType: PageType;
  headings: string[];
  cleanText: string;
  sections: KnowledgeBaseSection[];
}

type PageType =
  | "documentation"
  | "faq"
  | "feature"
  | "pricing"
  | "blog"
  | "general";

interface ProductSummary {
  productName: string;
  oneSentenceSummary: string;
  whatItDoes: string;
  targetUsers: string[];
}

interface Feature {
  name: string;
  description: string;
  evidence: string[];
}

interface UseCase {
  title: string;
  description: string;
}

interface HowTo {
  title: string;
  steps: string[];
}

interface RefinedKnowledgeBatch {
  productSummary: ProductSummary;
  features: Feature[];
  useCases: UseCase[];
  howTos: HowTo[];
  openQuestions: string[];
}

interface ClaudeTextBlock {
  type: "text";
  text: string;
}

interface ClaudeToolUseBlock {
  type: "tool_use";
  name: string;
  input: unknown;
}

type ClaudeContentBlock =
  | ClaudeTextBlock
  | ClaudeToolUseBlock
  | { type: string };

const DEFAULT_PROGRESS_DATA: ProgressData = {
  status: "crawling",
  visitedPages: 0,
  maxPages: MAX_PAGES,
  currentBatch: 0,
  totalBatches: 0,
  progress: 0,
  message: "Starting crawl...",
  error: null,
  startedAt: new Date().toISOString(),
  completedAt: null,
};

const SKIP_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".svg",
  ".bmp",
  ".ico",
  ".avif",
  ".pdf",
  ".zip",
  ".rar",
  ".7z",
  ".tar",
  ".gz",
  ".mp4",
  ".webm",
  ".mov",
  ".avi",
  ".mp3",
  ".wav",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".xml",
  ".json",
  ".csv",
  ".txt",
] as const;

const SKIP_PATH_PATTERNS = [
  "/wp-json/",
  "/wp-admin/",
  "/wp-content/",
  "/feed",
  "/cart",
  "/checkout",
  "/account",
] as const;

const refineBatchTool = {
  name: "extract_kb_signals",
  description:
    "Extract concise documentation signals from crawled website pages.",
  input_schema: {
    type: "object",
    properties: {
      productSummary: {
        type: "object",
        properties: {
          productName: { type: "string" },
          oneSentenceSummary: { type: "string" },
          whatItDoes: { type: "string" },
          targetUsers: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: [
          "productName",
          "oneSentenceSummary",
          "whatItDoes",
          "targetUsers",
        ],
        additionalProperties: false,
      },
      features: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            evidence: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: ["name", "description", "evidence"],
          additionalProperties: false,
        },
      },
      useCases: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
          },
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
            steps: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: ["title", "steps"],
          additionalProperties: false,
        },
      },
      openQuestions: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: [
      "productSummary",
      "features",
      "useCases",
      "howTos",
      "openQuestions",
    ],
    additionalProperties: false,
  },
  strict: true,
} as const;

const visited = new Set<string>();
const queued = new Set<string>();
const queue: string[] = [];
const knowledgeBase: KnowledgeBaseItem[] = [];
const limit = pLimit(CONCURRENCY);

const normalizedStartUrl = normalizeUrl(START_URL);
if (normalizedStartUrl === null) {
  throw new Error(`Invalid START_URL: ${START_URL}`);
}
queue.push(normalizedStartUrl);
queued.add(normalizedStartUrl);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function ensureDirExists(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function cleanupTempFiles(): void {
  for (const filePath of [PID_PATH, LOG_PATH, RAW_KB_PATH]) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // ignore cleanup failures
    }
  }
}

function writeProgress(data: Partial<ProgressData>): void {
  try {
    ensureDirExists(PROGRESS_PATH);

    let current: ProgressData = DEFAULT_PROGRESS_DATA;

    if (fs.existsSync(PROGRESS_PATH)) {
      try {
        const parsed = safeParseJson(fs.readFileSync(PROGRESS_PATH, "utf-8"));
        if (isProgressData(parsed)) {
          current = parsed;
        }
      } catch {
        current = DEFAULT_PROGRESS_DATA;
      }
    }

    const updated: ProgressData = {
      ...current,
      ...data,
    };

    fs.writeFileSync(PROGRESS_PATH, JSON.stringify(updated, null, 2), "utf-8");
  } catch (error) {
    console.error("Failed to write progress:", error);
  }
}

function isProgressData(value: unknown): value is ProgressData {
  if (!isRecord(value)) return false;

  return (
    (value.status === "crawling" ||
      value.status === "refining" ||
      value.status === "done" ||
      value.status === "error") &&
    typeof value.visitedPages === "number" &&
    typeof value.maxPages === "number" &&
    typeof value.currentBatch === "number" &&
    typeof value.totalBatches === "number" &&
    typeof value.progress === "number" &&
    typeof value.message === "string" &&
    (typeof value.error === "string" || value.error === null) &&
    typeof value.startedAt === "string" &&
    (typeof value.completedAt === "string" || value.completedAt === null)
  );
}

function normalizeUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    url.hash = "";

    const trackingParams = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "fbclid",
      "gclid",
    ];

    for (const param of trackingParams) {
      url.searchParams.delete(param);
    }

    if (url.pathname.length > 1) {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }

    return url.toString();
  } catch {
    return null;
  }
}

function getDomain(url: string): string {
  return new URL(url).hostname;
}

function isSameDomain(url: string, baseDomain: string): boolean {
  try {
    return getDomain(url) === baseDomain;
  } catch {
    return false;
  }
}

function hasSkippableExtension(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return SKIP_EXTENSIONS.some((ext) => pathname.endsWith(ext));
  } catch {
    return true;
  }
}

function shouldSkipUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const lowerPath = parsed.pathname.toLowerCase();

    if (!["http:", "https:"].includes(parsed.protocol)) return true;
    if (hasSkippableExtension(url)) return true;
    if (SKIP_PATH_PATTERNS.some((pattern) => lowerPath.includes(pattern)))
      return true;

    return false;
  } catch {
    return true;
  }
}

function isHtmlResponse(contentType: string | undefined): boolean {
  return (contentType ?? "").toLowerCase().includes("text/html");
}

function cleanText(text: string): string {
  return text
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isJunkLine(line: string): boolean {
  if (line.length < 2) return true;
  if (/^(skip to content|scroll to top)$/i.test(line)) return true;
  if (
    /^(get started|get contentgate|join waitlist|email|message|learn more)$/i.test(
      line
    )
  ) {
    return true;
  }
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
  $(
    [
      "script",
      "style",
      "noscript",
      "iframe",
      "svg",
      "canvas",
      "img",
      "picture",
      "source",
      "video",
      "audio",
      "form",
      "input",
      "textarea",
      "button",
      "select",
      "label",
      "nav",
      "footer",
      "header",
      "aside",
      ".menu",
      ".nav",
      ".navbar",
      ".footer",
      ".header",
      ".sidebar",
      ".popup",
      ".modal",
      ".cookie",
      ".breadcrumbs",
      ".social",
      ".share",
      ".newsletter",
      ".subscribe",
      ".comment",
      ".comments",
      ".related",
      ".recommended",
      ".cta",
      ".hero-form",
      "#comments",
    ].join(",")
  ).remove();
}

function isElement(node: unknown): node is Element {
  return isRecord(node) && typeof (node as unknown as Element).tagName === "string";
}

function scoreNode($: CheerioAPI, el: Element): number {
  const node = $(el);
  const text = cleanText(node.text());
  if (!text) return 0;

  const textLen = text.length;
  const pCount = node.find("p").length;
  const liCount = node.find("li").length;
  const headingCount = node.find("h1,h2,h3,h4").length;

  let score = textLen;
  score += pCount * 80;
  score += liCount * 40;
  score += headingCount * 30;

  const classId = `${node.attr("class") ?? ""} ${
    node.attr("id") ?? ""
  }`.toLowerCase();

  if (/content|article|post|entry|main|doc|page|section/.test(classId)) {
    score += 300;
  }

  if (
    /footer|header|nav|menu|sidebar|popup|modal|comment|share|related/.test(
      classId
    )
  ) {
    score -= 500;
  }

  return score;
}

function pickMainContent($: CheerioAPI): Cheerio<Element> {
  const candidates = [
    "main",
    "article",
    "[role='main']",
    ".content",
    ".entry-content",
    ".post-content",
    ".page-content",
    ".site-main",
    "section",
  ];

  let best: Element | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const selector of candidates) {
    $(selector).each((_, el) => {
      if (!isElement(el)) return;
      const score = scoreNode($, el);
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    });
  }

  if (best === null) {
    $("div").each((_, el) => {
      if (!isElement(el)) return;
      const score = scoreNode($, el);
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    });
  }

  return best ? $(best) : $("body");
}

function extractSections(
  root: Cheerio<Element>,
  $: CheerioAPI
): KnowledgeBaseSection[] {
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

    if (current === null) {
      current = { heading: "Overview", content: [] };
      sections.push(current);
    }

    current.content.push(text);
  });

  return sections
    .map((section) => ({
      heading: section.heading,
      content: dedupeLines(section.content).join("\n"),
    }))
    .filter((section) => section.content.length > 0);
}

function classifyPage(
  url: string,
  title: string,
  headings: string[]
): PageType {
  const blob = `${url} ${title} ${headings.join(" ")}`.toLowerCase();

  if (/docs|documentation|help|knowledge-base/.test(blob))
    return "documentation";
  if (/faq/.test(blob)) return "faq";
  if (/feature|features/.test(blob)) return "feature";
  if (/pricing|price/.test(blob)) return "pricing";
  if (/blog|article|news/.test(blob)) return "blog";
  return "general";
}

function chunkArray<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }

  return chunks;
}

function stripLargeFields(page: KnowledgeBaseItem): KnowledgeBaseItem {
  return {
    url: page.url,
    title: page.title,
    pageType: page.pageType,
    headings: page.headings.slice(0, 20),
    sections: page.sections.slice(0, 20).map((section) => ({
      heading: section.heading,
      content: section.content.slice(0, 4000),
    })),
    cleanText: page.cleanText.slice(0, 8000),
  };
}

function safeParseJson(text: string): unknown {
  if (!text.trim()) {
    throw new Error("Expected non-empty JSON text.");
  }

  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```json\s*/i, "").replace(/^```\s*/i, "");
  cleaned = cleaned.replace(/\s*```$/, "");

  try {
    return JSON.parse(cleaned);
  } catch {
    // continue
  }

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const candidate = cleaned.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const positionMatch = message.match(/position (\d+)/);
      const errorPosition = positionMatch ? Number(positionMatch[1]) : 0;
      const previewStart = Math.max(0, errorPosition - 150);
      const preview = candidate.slice(previewStart, previewStart + 400);

      throw new Error(
        `Invalid JSON after extraction.\nParse error: ${message}\nPreview near failure:\n${preview}`
      );
    }
  }

  throw new Error("No JSON object found in text.");
}

function extractLinks(
  $: CheerioAPI,
  currentUrl: string,
  baseDomain: string
): string[] {
  const discovered: string[] = [];

  $("a[href]").each((_, el) => {
    const href = ($(el).attr("href") ?? "").trim();
    if (!href) return;
    if (href.startsWith("#")) return;
    if (href.startsWith("mailto:")) return;
    if (href.startsWith("tel:")) return;
    if (href.startsWith("javascript:")) return;

    let absolute: string;
    try {
      absolute = new URL(href, currentUrl).href;
    } catch {
      return;
    }

    const normalized = normalizeUrl(absolute);
    if (normalized === null) return;
    if (!isSameDomain(normalized, baseDomain)) return;
    if (shouldSkipUrl(normalized)) return;

    discovered.push(normalized);
  });

  return [...new Set(discovered)];
}

function isKnowledgeBaseSection(value: unknown): value is KnowledgeBaseSection {
  return (
    isRecord(value) &&
    typeof value.heading === "string" &&
    typeof value.content === "string"
  );
}

function isKnowledgeBaseItem(value: unknown): value is KnowledgeBaseItem {
  return (
    isRecord(value) &&
    typeof value.url === "string" &&
    typeof value.title === "string" &&
    typeof value.pageType === "string" &&
    isStringArray(value.headings) &&
    typeof value.cleanText === "string" &&
    Array.isArray(value.sections) &&
    value.sections.every(isKnowledgeBaseSection)
  );
}

function parseKnowledgeBaseArray(value: unknown): KnowledgeBaseItem[] {
  if (!Array.isArray(value)) {
    throw new Error("Expected raw knowledge base to be an array.");
  }

  if (!value.every(isKnowledgeBaseItem)) {
    throw new Error("Raw knowledge base contains invalid items.");
  }

  return value;
}

function isFeature(value: unknown): value is Feature {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.description === "string" &&
    isStringArray(value.evidence)
  );
}

function isUseCase(value: unknown): value is UseCase {
  return (
    isRecord(value) &&
    typeof value.title === "string" &&
    typeof value.description === "string"
  );
}

function isHowTo(value: unknown): value is HowTo {
  return (
    isRecord(value) &&
    typeof value.title === "string" &&
    isStringArray(value.steps)
  );
}

function isProductSummary(value: unknown): value is ProductSummary {
  return (
    isRecord(value) &&
    typeof value.productName === "string" &&
    typeof value.oneSentenceSummary === "string" &&
    typeof value.whatItDoes === "string" &&
    isStringArray(value.targetUsers)
  );
}

function isRefinedKnowledgeBatch(
  value: unknown
): value is RefinedKnowledgeBatch {
  return (
    isRecord(value) &&
    isProductSummary(value.productSummary) &&
    Array.isArray(value.features) &&
    value.features.every(isFeature) &&
    Array.isArray(value.useCases) &&
    value.useCases.every(isUseCase) &&
    Array.isArray(value.howTos) &&
    value.howTos.every(isHowTo) &&
    isStringArray(value.openQuestions)
  );
}

function getClaudeContentBlocks(response: unknown): ClaudeContentBlock[] {
  if (!isRecord(response)) return [];
  const content = response.content;
  return Array.isArray(content) ? (content as ClaudeContentBlock[]) : [];
}

function extractTextFromClaudeResponse(response: unknown): string {
  return getClaudeContentBlocks(response)
    .filter(
      (item): item is ClaudeTextBlock =>
        item.type === "text" && "text" in item && typeof item.text === "string"
    )
    .map((item) => item.text)
    .join("\n");
}

function getToolInput(response: unknown, toolName: string): unknown {
  const contentBlocks = getClaudeContentBlocks(response);

  const toolBlock = contentBlocks.find(
    (item): item is ClaudeToolUseBlock =>
      item.type === "tool_use" &&
      "name" in item &&
      "input" in item &&
      typeof item.name === "string" &&
      item.name === toolName
  );

  if (!toolBlock) {
    const textFallback = extractTextFromClaudeResponse(response);
    const suffix = textFallback
      ? `\nClaude text response:\n${textFallback}`
      : "";
    throw new Error(`Claude did not call required tool: ${toolName}${suffix}`);
  }

  return toolBlock.input;
}

async function crawlPage(url: string, baseDomain: string): Promise<void> {
  if (visited.has(url) || visited.size >= MAX_PAGES || shouldSkipUrl(url)) {
    return;
  }

  visited.add(url);
  console.log(`Crawling: ${url}`);

  const crawlProgress = Math.min(
    Math.round((visited.size / MAX_PAGES) * 50),
    50
  );

  writeProgress({
    status: "crawling",
    visitedPages: visited.size,
    progress: crawlProgress,
    message: `Crawling pages... (${visited.size}/${MAX_PAGES})`,
  });

  try {
    const response = await axios.get<string>(url, {
      timeout: REQUEST_TIMEOUT_MS,
      maxRedirects: 5,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; KB-Crawler/3.0)",
      },
      validateStatus: (status) => status >= 200 && status < 400,
      responseType: "text",
    });

    const contentType = response.headers["content-type"];
    if (!isHtmlResponse(contentType)) {
      console.log(`Skipping non-HTML: ${url}`);
      return;
    }

    const html = response.data;
    if (typeof html !== "string") {
      console.log(`Skipping non-text response body: ${url}`);
      return;
    }

    const link$ = cheerio.load(html);
    const discoveredLinks = extractLinks(link$, url, baseDomain);

    for (const nextUrl of discoveredLinks) {
      if (
        !visited.has(nextUrl) &&
        !queued.has(nextUrl) &&
        visited.size + queue.length < MAX_PAGES * MAX_QUEUE_MULTIPLIER
      ) {
        queue.push(nextUrl);
        queued.add(nextUrl);
      }
    }

    const $ = cheerio.load(html);
    removeBoilerplate($);

    const title = cleanText($("title").first().text());
    const mainRoot = pickMainContent($);

    const rootHtml = mainRoot.html() ?? "";
    const local$ = cheerio.load(`<div id="root">${rootHtml}</div>`);
    removeBoilerplate(local$);

    const root = local$("#root");

    const headings = dedupeLines(
      root
        .find("h1,h2,h3")
        .map((_, el) => local$(el).text())
        .get()
    );

    const sections = extractSections(root, local$);

    const cleanBody = dedupeLines(
      root
        .text()
        .split("\n")
        .map((line) => cleanText(line))
    ).join("\n");

    if (cleanBody.length >= MIN_PAGE_TEXT_LENGTH) {
      knowledgeBase.push({
        url,
        title,
        pageType: classifyPage(url, title, headings),
        headings,
        cleanText: cleanBody,
        sections,
      });
    }

    console.log(`  Found ${discoveredLinks.length} internal links`);
    console.log(`  Queue size: ${queue.length}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed: ${url} -> ${message}`);
  }
}

async function refineBatchWithClaudeStructured(
  pages: KnowledgeBaseItem[],
  batchNumber: number,
  totalBatches: number
): Promise<RefinedKnowledgeBatch> {
  console.log(`Refining batch ${batchNumber}/${totalBatches} with Claude...`);

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 4000,
    temperature: 0,
    tools: [
      {
        ...refineBatchTool,
        input_schema: {
          ...refineBatchTool.input_schema,
          required: [...refineBatchTool.input_schema.required],
        },
      },
    ],
    tool_choice: {
      type: "tool",
      name: "extract_kb_signals",
    },
    messages: [
      {
        role: "user",
        content: `
Refine these crawled website pages into a documentation-ready knowledge base batch.

Rules:
- Use only the provided input.
- Remove boilerplate and repeated marketing CTA language.
- Do not invent unsupported product behavior.
- Capture product, features, use cases, terminology, and how-to guidance.
- Put uncertainty into openQuestions.

Input pages:
${JSON.stringify(pages)}
        `.trim(),
      },
    ],
  });

  const toolInput = getToolInput(response, "extract_kb_signals");

  if (!isRefinedKnowledgeBatch(toolInput)) {
    throw new Error("Claude returned invalid structured tool output.");
  }

  return toolInput;
}

async function refineKnowledgeBaseWithClaude(
  rawKnowledgeBase: KnowledgeBaseItem[]
): Promise<RefinedKnowledgeBatch[]> {
  const pageBatches = chunkArray(
    rawKnowledgeBase.map(stripLargeFields),
    PAGE_BATCH_SIZE
  );

  const refinedBatches: RefinedKnowledgeBatch[] = [];

  for (let i = 0; i < pageBatches.length; i += 1) {
    writeProgress({
      status: "refining",
      currentBatch: i + 1,
      totalBatches: pageBatches.length,
      progress: 50 + Math.round(((i + 1) / pageBatches.length) * 50),
      message: `Refining knowledge base with AI... (batch ${i + 1}/${
        pageBatches.length
      })`,
    });

    const refined = await refineBatchWithClaudeStructured(
      pageBatches[i],
      i + 1,
      pageBatches.length
    );

    refinedBatches.push(refined);
  }

  return refinedBatches;
}

async function saveRefinedKnowledgeBase(
  rawKnowledgeBase: KnowledgeBaseItem[]
): Promise<void> {
  const finalKnowledgeBase = await refineKnowledgeBaseWithClaude(
    rawKnowledgeBase
  );

  const connectionString =
    process.env.DATABASE_URL ||
    "postgres://tg_docs_user:tg_docs_password@localhost:5432/tg_docs_db";
  const sql = postgres(connectionString, { max: 1 });

  try {
    const [project] = await sql`SELECT id FROM projects WHERE slug = ${PROJECT_SLUG}`;
    if (!project) throw new Error(`Project not found: ${PROJECT_SLUG}`);

    await sql`
      INSERT INTO project_knowledge_bases (project_id, type, content, metadata)
      VALUES (
        ${project.id},
        'website',
        ${sql.json(JSON.parse(JSON.stringify(finalKnowledgeBase)))},
        ${sql.json(START_URL ? { siteLink: START_URL } : {})}
      )
      ON CONFLICT (project_id, type)
      DO UPDATE SET
        content    = EXCLUDED.content,
        metadata   = EXCLUDED.metadata,
        updated_at = NOW()
    `;
    console.log(`✅ Refined knowledge base saved to database for project: ${PROJECT_SLUG}`);
  } finally {
    await sql.end();
  }
}

async function runCrawler(): Promise<void> {
  if (normalizedStartUrl === null) {
    throw new Error("normalizedStartUrl is null");
  }
  const baseDomain = getDomain(normalizedStartUrl);

  writeProgress({
    status: "crawling",
    visitedPages: 0,
    maxPages: MAX_PAGES,
    progress: 0,
    message: "Starting crawl...",
    startedAt: new Date().toISOString(),
    completedAt: null,
    error: null,
  });

  if (fs.existsSync(RAW_KB_PATH)) {
    console.log(`📂 Found existing ${RAW_KB_PATH}. Skipping crawl...`);

    const existingRawKbUnknown = safeParseJson(
      fs.readFileSync(RAW_KB_PATH, "utf-8")
    );
    const existingRawKb = parseKnowledgeBaseArray(existingRawKbUnknown);

    if (existingRawKb.length === 0) {
      throw new Error(`${RAW_KB_PATH} exists but is empty.`);
    }

    console.log(`🧾 Loaded ${existingRawKb.length} pages from existing raw KB`);
    await saveRefinedKnowledgeBase(existingRawKb);

    writeProgress({
      status: "done",
      progress: 100,
      message: "Knowledge base ready.",
      completedAt: new Date().toISOString(),
    });

    cleanupTempFiles();
    console.log("\n✅ Done");
    console.log("Visited: 0 (crawl skipped)");
    console.log(`Saved pages: ${existingRawKb.length}`);
    return;
  }

  while (queue.length > 0 && visited.size < MAX_PAGES) {
    const batch = queue.splice(0, CONCURRENCY);
    await Promise.all(
      batch.map((url) => limit(() => crawlPage(url, baseDomain)))
    );
  }

  ensureDirExists(RAW_KB_PATH);
  fs.writeFileSync(
    RAW_KB_PATH,
    JSON.stringify(knowledgeBase, null, 2),
    "utf-8"
  );
  console.log("🧾 Raw knowledge base saved");

  if (knowledgeBase.length === 0) {
    writeProgress({
      status: "error",
      progress: 0,
      message: "No pages crawled.",
      error: "Crawl returned 0 pages.",
      completedAt: new Date().toISOString(),
    });

    cleanupTempFiles();
    console.error("❌ No pages crawled. Skipping Claude.");
    return;
  }

  await saveRefinedKnowledgeBase(knowledgeBase);

  writeProgress({
    status: "done",
    progress: 100,
    message: "Knowledge base ready.",
    completedAt: new Date().toISOString(),
  });

  cleanupTempFiles();
  console.log("\n✅ Done");
  console.log(`Visited: ${visited.size}`);
  console.log(`Saved pages: ${knowledgeBase.length}`);
}

void runCrawler().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);

  writeProgress({
    status: "error",
    message: `Crawler failed: ${message}`,
    error: message,
    completedAt: new Date().toISOString(),
  });

  cleanupTempFiles();
  console.error("Crawler failed:", error);
});
