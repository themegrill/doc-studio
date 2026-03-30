import path from "path";
import axios from "axios";
import * as cheerio from "cheerio";
import pLimit from "p-limit";
import { URL } from "url";
import fs from "fs";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? '',
});

const START_URL = process.argv[2] || "https://contentgate.net/";
const OUTPUT_PATH = process.argv[3] || "knowledge-base.refined.json";
const KB_DIR = path.dirname(OUTPUT_PATH);
const PROGRESS_PATH = path.join(KB_DIR, "crawl-progress.json");
const PID_PATH = path.join(KB_DIR, "crawl-pid.txt");
const LOG_PATH = path.join(KB_DIR, "crawl-log.txt");

const RAW_KB_PATH = path.join(KB_DIR, "knowledge-base.raw.json");

function cleanupTempFiles() {
  for (const f of [PID_PATH, LOG_PATH, RAW_KB_PATH]) {
    try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch { /* ignore */ }
  }
}
const MAX_PAGES = 200;
const CONCURRENCY = 5;
const REQUEST_TIMEOUT = 10000;

interface ProgressData {
  status: "crawling" | "refining" | "done" | "error";
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

function writeProgress(data: Partial<ProgressData>) {
  try {
    const dir = path.dirname(PROGRESS_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    let current: ProgressData = {
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

    if (fs.existsSync(PROGRESS_PATH)) {
      try {
        current = JSON.parse(fs.readFileSync(PROGRESS_PATH, "utf-8"));
      } catch { /* use defaults */ }
    }

    const updated = { ...current, ...data };
    fs.writeFileSync(PROGRESS_PATH, JSON.stringify(updated, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to write progress:", err);
  }
}

const visited = new Set();
const queued = new Set();
const queue = [];
const knowledgeBase = [];

const limit = pLimit(CONCURRENCY);

const SKIP_EXTENSIONS = [
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp", ".ico", ".avif",
  ".pdf", ".zip", ".rar", ".7z", ".tar", ".gz",
  ".mp4", ".webm", ".mov", ".avi", ".mp3", ".wav",
  ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".xml", ".json", ".csv", ".txt"
];

const SKIP_PATH_PATTERNS = [
  "/wp-json/",
  "/wp-admin/",
  "/wp-content/",
  "/feed",
  "/cart",
  "/checkout",
  "/account"
];

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
          targetUsers: {
            type: "array",
            items: { type: "string" }
          }
        },
        required: [
          "productName",
          "oneSentenceSummary",
          "whatItDoes",
          "targetUsers"
        ],
        additionalProperties: false
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
              items: { type: "string" }
            }
          },
          required: ["name", "description", "evidence"],
          additionalProperties: false
        }
      },
      useCases: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" }
          },
          required: ["title", "description"],
          additionalProperties: false
        }
      },
      howTos: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            steps: {
              type: "array",
              items: { type: "string" }
            }
          },
          required: ["title", "steps"],
          additionalProperties: false
        }
      },
      openQuestions: {
        type: "array",
        items: { type: "string" }
      }
    },
    required: [
      "productSummary",
      "features",
      "useCases",
      "howTos",
      "openQuestions"
    ],
    additionalProperties: false
  },
  strict: true
};

queue.push(START_URL);
queued.add(normalizeUrl(START_URL));

function normalizeUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    u.hash = "";

    [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "fbclid",
      "gclid"
    ].forEach((p) => u.searchParams.delete(p));

    if (u.pathname.length > 1) {
      u.pathname = u.pathname.replace(/\/+$/, "");
    }

    return u.toString();
  } catch {
    return null;
  }
}

function getDomain(url) {
  return new URL(url).hostname;
}

function isSameDomain(url, baseDomain) {
  try {
    return getDomain(url) === baseDomain;
  } catch {
    return false;
  }
}

function hasSkippableExtension(url) {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return SKIP_EXTENSIONS.some((ext) => pathname.endsWith(ext));
  } catch {
    return true;
  }
}

function shouldSkipUrl(url) {
  try {
    const u = new URL(url);
    const lower = u.pathname.toLowerCase();

    if (!["http:", "https:"].includes(u.protocol)) return true;
    if (hasSkippableExtension(url)) return true;
    if (SKIP_PATH_PATTERNS.some((p) => lower.includes(p))) return true;

    return false;
  } catch {
    return true;
  }
}

function isHtmlResponse(contentType = "") {
  return contentType.toLowerCase().includes("text/html");
}

function cleanText(text) {
  return (text || "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isJunkLine(line) {
  if (!line) return true;
  if (line.length < 2) return true;
  if (/^(skip to content|scroll to top)$/i.test(line)) return true;
  if (/^(get started|get contentgate|join waitlist|email|message|learn more)$/i.test(line)) return true;
  if (/^\d+$/.test(line)) return true;
  if (/^(∞|100%|2 min|0)$/i.test(line)) return true;
  if (/^[#>*\-\s]+$/.test(line)) return true;

  return false;
}

function dedupeLines(lines) {
  const seen = new Set();
  const out = [];

  for (const raw of lines) {
    const line = cleanText(raw);
    const key = line.toLowerCase();

    if (!line || isJunkLine(line)) continue;
    if (seen.has(key)) continue;

    seen.add(key);
    out.push(line);
  }

  return out;
}

function removeBoilerplate($) {
  $([
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
    "#comments"
  ].join(",")).remove();
}

function scoreNode($, el) {
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

  const classId = `${node.attr("class") || ""} ${node.attr("id") || ""}`.toLowerCase();
  if (/content|article|post|entry|main|doc|page|section/.test(classId)) score += 300;
  if (/footer|header|nav|menu|sidebar|popup|modal|comment|share|related/.test(classId)) score -= 500;

  return score;
}

function pickMainContent($) {
  const candidates = [
    "main",
    "article",
    "[role='main']",
    ".content",
    ".entry-content",
    ".post-content",
    ".page-content",
    ".site-main",
    "section"
  ];

  let best = null;
  let bestScore = -Infinity;

  for (const selector of candidates) {
    $(selector).each((_, el) => {
      const score = scoreNode($, el);
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    });
  }

  if (!best) {
    $("div").each((_, el) => {
      const score = scoreNode($, el);
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    });
  }

  return best ? $(best) : $("body");
}

function extractSections(root, $) {
  const sections = [];
  let current = null;

  root.children().each((_, el) => {
    const tag = (el.tagName || "").toLowerCase();
    const node = $(el);

    if (/^h[1-4]$/.test(tag)) {
      const heading = cleanText(node.text());
      if (!heading || isJunkLine(heading)) return;

      current = { heading, content: [] };
      sections.push(current);
      return;
    }

    const text = cleanText(node.text());
    if (!text || isJunkLine(text)) return;

    if (!current) {
      current = { heading: "Overview", content: [] };
      sections.push(current);
    }

    current.content.push(text);
  });

  return sections
    .map((s) => ({
      heading: s.heading,
      content: dedupeLines(s.content).join("\n")
    }))
    .filter((s) => s.content.length > 0);
}

function classifyPage(url, title, headings) {
  const blob = `${url} ${title} ${headings.join(" ")}`.toLowerCase();

  if (/docs|documentation|help|knowledge-base/.test(blob)) return "documentation";
  if (/faq/.test(blob)) return "faq";
  if (/feature|features/.test(blob)) return "feature";
  if (/pricing|price/.test(blob)) return "pricing";
  if (/blog|article|news/.test(blob)) return "blog";
  return "general";
}

function extractLinks($, currentUrl, baseDomain) {
  const discovered = [];

  $("a[href]").each((_, el) => {
    const href = ($(el).attr("href") || "").trim();
    if (!href) return;
    if (href.startsWith("#")) return;
    if (href.startsWith("mailto:")) return;
    if (href.startsWith("tel:")) return;
    if (href.startsWith("javascript:")) return;

    let absolute;
    try {
      absolute = new URL(href, currentUrl).href;
    } catch {
      return;
    }

    const normalized = normalizeUrl(absolute);
    if (!normalized) return;
    if (!isSameDomain(normalized, baseDomain)) return;
    if (shouldSkipUrl(normalized)) return;

    discovered.push(normalized);
  });

  return [...new Set(discovered)];
}

async function crawlPage(url, baseDomain) {
  if (visited.has(url) || visited.size >= MAX_PAGES || shouldSkipUrl(url)) {
    return;
  }

  visited.add(url);
  console.log(`Crawling: ${url}`);
  const crawlProgress = Math.min(Math.round((visited.size / MAX_PAGES) * 50), 50);
  writeProgress({
    status: "crawling",
    visitedPages: visited.size,
    progress: crawlProgress,
    message: `Crawling pages... (${visited.size}/${MAX_PAGES})`,
  });

  try {
    const response = await axios.get(url, {
      timeout: REQUEST_TIMEOUT,
      maxRedirects: 5,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; KB-Crawler/3.0)"
      },
      validateStatus: (s) => s >= 200 && s < 400
    });

    const contentType = response.headers["content-type"] || "";
    if (!isHtmlResponse(contentType)) {
      console.log(`Skipping non-HTML: ${url}`);
      return;
    }

    const html = response.data;

    // 1. Extract links from ORIGINAL html before cleaning
    const link$ = cheerio.load(html);
    const discoveredLinks = extractLinks(link$, url, baseDomain);

    for (const nextUrl of discoveredLinks) {
      if (!visited.has(nextUrl) && !queued.has(nextUrl) && visited.size + queue.length < MAX_PAGES * 3) {
        queue.push(nextUrl);
        queued.add(nextUrl);
      }
    }

    // 2. Clean a separate DOM for content extraction
    const $ = cheerio.load(html);
    removeBoilerplate($);

    const title = cleanText($("title").first().text());
    const mainRoot = pickMainContent($);

    const rootHtml = mainRoot.html() || "";
    const local$ = cheerio.load(`<div id="root">${rootHtml}</div>`);
    removeBoilerplate(local$);

    const root = local$("#root");

    const headings = dedupeLines(
      root.find("h1,h2,h3").map((_, el) => local$(el).text()).get()
    );

    const sections = extractSections(root, local$);

    const cleanBody = dedupeLines(
      root.text().split("\n").map((s) => cleanText(s))
    ).join("\n");

    if (cleanBody.length >= 120) {
      knowledgeBase.push({
        url,
        title,
        pageType: classifyPage(url, title, headings),
        headings,
        cleanText: cleanBody,
        sections
      });
    }

    console.log(`  Found ${discoveredLinks.length} internal links`);
    console.log(`  Queue size: ${queue.length}`);
  } catch (err) {
    console.error(`Failed: ${url} -> ${err.message}`);
  }
}

// Keep batches small enough for your model/context size
function chunkArray(arr, size = 10) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function stripLargeFields(page) {
  return {
    url: page.url || "",
    title: page.title || "",
    pageType: page.pageType || "general",
    headings: Array.isArray(page.headings) ? page.headings.slice(0, 20) : [],
    sections: Array.isArray(page.sections)
      ? page.sections.slice(0, 20).map((s) => ({
          heading: s.heading || "",
          content: (s.content || "").slice(0, 4000),
        }))
      : [],
    cleanText: (page.cleanText || "").slice(0, 8000),
  };
}

function extractTextFromClaudeResponse(response) {
  return (response.content || [])
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("\n");
}

async function refineKnowledgeBaseWithClaude(rawKnowledgeBase) {
  const pageBatches = chunkArray(rawKnowledgeBase.map(stripLargeFields), 3);
  const refinedBatches = [];

  for (let i = 0; i < pageBatches.length; i++) {
    writeProgress({
      status: "refining",
      currentBatch: i + 1,
      totalBatches: pageBatches.length,
      progress: 50 + Math.round(((i + 1) / pageBatches.length) * 50),
      message: `Refining knowledge base with AI... (batch ${i + 1}/${pageBatches.length})`,
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

// Example integration point:
// Call this AFTER crawling completes, BEFORE saving.
async function saveRefinedKnowledgeBase(knowledgeBase) {
  const finalKnowledgeBase = await refineKnowledgeBaseWithClaude(knowledgeBase);

  const dir = require("path").dirname(OUTPUT_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(finalKnowledgeBase, null, 2), "utf-8");

  console.log(`✅ Refined knowledge base saved to ${OUTPUT_PATH}`);
}

async function runCrawler() {
  const baseDomain = getDomain(START_URL);

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

  // 1. If raw knowledge base already exists, reuse it
  if (fs.existsSync(RAW_KB_PATH)) {
    console.log(`📂 Found existing ${RAW_KB_PATH}. Skipping crawl...`);

    const existingRawKb = JSON.parse(
      fs.readFileSync(RAW_KB_PATH, "utf-8")
    );

    if (!Array.isArray(existingRawKb) || existingRawKb.length === 0) {
      throw new Error(`${RAW_KB_PATH} exists but is empty or invalid.`);
    }

    console.log(`🧾 Loaded ${existingRawKb.length} pages from existing raw KB`);
    await saveRefinedKnowledgeBase(existingRawKb);

    writeProgress({ status: "done", progress: 100, message: "Knowledge base ready.", completedAt: new Date().toISOString() });
    cleanupTempFiles();
    console.log(`\n✅ Done`);
    console.log(`Visited: 0 (crawl skipped)`);
    console.log(`Saved pages: ${existingRawKb.length}`);
    return;
  }

  while (queue.length > 0 && visited.size < MAX_PAGES) {
    const batch = queue.splice(0, CONCURRENCY);

    await Promise.all(
      batch.map((url) => limit(() => crawlPage(url, baseDomain)))
    );
  }

	fs.writeFileSync(RAW_KB_PATH, JSON.stringify(knowledgeBase, null, 2), "utf-8");

	console.log("🧾 Raw knowledge base saved");

	if (knowledgeBase.length === 0) {
    writeProgress({ status: "error", progress: 0, message: "No pages crawled.", error: "Crawl returned 0 pages.", completedAt: new Date().toISOString() });
    cleanupTempFiles();
		console.error("❌ No pages crawled. Skipping Claude.");
		return;
	}

	// Now refine with Claude
	await saveRefinedKnowledgeBase(knowledgeBase);

  writeProgress({ status: "done", progress: 100, message: "Knowledge base ready.", completedAt: new Date().toISOString() });
  cleanupTempFiles();
  console.log(`\n✅ Done`);
  console.log(`Visited: ${visited.size}`);
  console.log(`Saved pages: ${knowledgeBase.length}`);
}

function safeParseJSON(text) {
  if (!text || typeof text !== "string") {
    throw new Error("Claude returned empty response text.");
  }

  let cleaned = text.trim();

  // Remove ```json ... ``` fences if present
  cleaned = cleaned.replace(/^```json\s*/i, "").replace(/^```\s*/i, "");
  cleaned = cleaned.replace(/\s*```$/, "");

  // First try direct parse
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    // Fall through
  }

  // Try extracting the largest JSON object
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const candidate = cleaned.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch (err) {
      const previewStart = Math.max(0, err.message.includes("position")
        ? Number((err.message.match(/position (\d+)/) || [])[1] || 0) - 150
        : 0);
      const preview = candidate.slice(previewStart, previewStart + 400);

      throw new Error(
        `Claude returned invalid JSON even after extraction.\n` +
        `Parse error: ${err.message}\n` +
        `Preview near failure:\n${preview}`
      );
    }
  }

  throw new Error("No JSON object found in Claude response.");
}

function getToolInput(response, toolName) {
  const block = (response.content || []).find(
    (item) => item.type === "tool_use" && item.name === toolName
  );

  if (!block) {
    throw new Error(`Claude did not call required tool: ${toolName}`);
  }

  return block.input;
}

async function refineBatchWithClaudeStructured(pages, batchNumber, totalBatches) {
  console.log(`Refining batch ${batchNumber}/${totalBatches} with Claude...`);

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 4000,
    temperature: 0,
    tools: [refineBatchTool],
    tool_choice: {
      type: "tool",
      name: "extract_kb_signals"
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
        `.trim()
      }
    ]
  });

  return getToolInput(response, "extract_kb_signals");
}

runCrawler().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  writeProgress({ status: "error", message: `Crawler failed: ${message}`, error: message, completedAt: new Date().toISOString() });
  cleanupTempFiles();
  console.error("Crawler failed:", err);
});
