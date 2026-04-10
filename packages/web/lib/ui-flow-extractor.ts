/**
 * UI Flow Extractor
 *
 * Analyzes UI design images using Claude vision and produces a structured
 * knowledge base describing screens, flows, fields, and components.
 */

import Anthropic from "@anthropic-ai/sdk";

// ─── Types ────────────────────────────────────────────────────────────────────

type FieldType =
  | "text" | "email" | "password" | "search" | "dropdown"
  | "radio" | "checkbox" | "date" | "number" | "table" | "unknown";

type Confidence = "high" | "medium" | "low";

export interface UiFlowField {
  label: string;
  type: FieldType;
  required: boolean;
  placeholder: string;
  help_text: string;
}

export interface UiFlowNavigation {
  trigger: string;
  destination: string;
  confidence: Confidence;
}

export interface UiFlowScreen {
  screen_title: string;
  screen_purpose: string;
  user_goal: string;
  primary_actions: string[];
  secondary_actions: string[];
  fields: UiFlowField[];
  navigation: UiFlowNavigation[];
  states: { empty: string[]; error: string[]; success: string[]; loading: string[] };
  content: { headings: string[]; labels: string[]; messages: string[] };
  components: string[];
  documentation_notes: string[];
  open_questions: string[];
  __source_file: string;
}

export interface UiFlowKnowledgeBase {
  project: { name: string };
  screens: UiFlowScreen[];
  flows: Array<{ from: string; to: string; trigger: string; confidence: Confidence }>;
  components: string[];
  open_questions: string[];
}

export interface UiFlowExtractionResult {
  knowledgebase: UiFlowKnowledgeBase;
  summary: { processed: number; succeeded: number; failed: number };
  failures: Array<{ source_file: string; error: string; message?: string }>;
}

export interface ImageBuffer {
  filename: string;
  data: Buffer;
  mimeType: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_FIELD_TYPES = new Set<FieldType>([
  "text", "email", "password", "search", "dropdown",
  "radio", "checkbox", "date", "number", "table", "unknown",
]);
const VALID_CONFIDENCE = new Set<Confidence>(["high", "medium", "low"]);

// ─── Extraction prompt ────────────────────────────────────────────────────────

function kbPrompt(): string {
  return `
You are a UX documentation extraction assistant.

Analyze a UI design artifact and return ONLY valid JSON.
Do not use markdown. Do not use code fences. Do not include explanatory text outside the JSON.

Return this exact schema:

{
  "screen_title": "string",
  "screen_purpose": "string",
  "user_goal": "string",
  "primary_actions": ["string"],
  "secondary_actions": ["string"],
  "fields": [
    {
      "label": "string",
      "type": "text|email|password|search|dropdown|radio|checkbox|date|number|table|unknown",
      "required": false,
      "placeholder": "string",
      "help_text": "string"
    }
  ],
  "navigation": [
    {
      "trigger": "string",
      "destination": "string",
      "confidence": "high|medium|low"
    }
  ],
  "states": {
    "empty": ["string"],
    "error": ["string"],
    "success": ["string"],
    "loading": ["string"]
  },
  "content": {
    "headings": ["string"],
    "labels": ["string"],
    "messages": ["string"]
  },
  "components": ["string"],
  "documentation_notes": ["string"],
  "open_questions": ["string"]
}

Rules:
- Prefer exact visible text from the artifact.
- Do not invent hidden functionality.
- If uncertain, put it in open_questions.
- If there are multiple screens, focus on the dominant screen.
- Always include every key from the schema.
- Use empty strings or empty arrays when unknown.
`.trim();
}

// ─── Normalizers ──────────────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function ns(v: unknown): string { return typeof v === "string" ? v : ""; }
function nsa(v: unknown): string[] { return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; }
function nft(v: unknown): FieldType { return typeof v === "string" && VALID_FIELD_TYPES.has(v as FieldType) ? (v as FieldType) : "unknown"; }
function nc(v: unknown): Confidence { return typeof v === "string" && VALID_CONFIDENCE.has(v as Confidence) ? (v as Confidence) : "low"; }

function normalizeField(v: unknown): UiFlowField {
  const f = isRecord(v) ? v : {};
  return {
    label: ns(f.label), type: nft(f.type),
    required: typeof f.required === "boolean" ? f.required : false,
    placeholder: ns(f.placeholder), help_text: ns(f.help_text),
  };
}

function normalizeScreen(raw: unknown, sourceFile: string): UiFlowScreen {
  const b = isRecord(raw) ? raw : {};
  const states = isRecord(b.states) ? b.states : {};
  const content = isRecord(b.content) ? b.content : {};
  return {
    screen_title: ns(b.screen_title),
    screen_purpose: ns(b.screen_purpose),
    user_goal: ns(b.user_goal),
    primary_actions: nsa(b.primary_actions),
    secondary_actions: nsa(b.secondary_actions),
    fields: Array.isArray(b.fields) ? b.fields.map(normalizeField) : [],
    navigation: Array.isArray(b.navigation)
      ? b.navigation.map((n) => isRecord(n) ? { trigger: ns(n.trigger), destination: ns(n.destination), confidence: nc(n.confidence) } : { trigger: "", destination: "", confidence: "low" as Confidence })
      : [],
    states: {
      empty: nsa(states.empty), error: nsa(states.error),
      success: nsa(states.success), loading: nsa(states.loading),
    },
    content: { headings: nsa(content.headings), labels: nsa(content.labels), messages: nsa(content.messages) },
    components: nsa(b.components),
    documentation_notes: nsa(b.documentation_notes),
    open_questions: nsa(b.open_questions),
    __source_file: sourceFile,
  };
}

// ─── JSON extraction ──────────────────────────────────────────────────────────

function extractJson(text: string): unknown | null {
  const t = text.trim();
  try { return JSON.parse(t); } catch { /* continue */ }
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) { try { return JSON.parse(fenced[1].trim()); } catch { /* continue */ } }
  const first = t.indexOf("{"), last = t.lastIndexOf("}");
  if (first !== -1 && last > first) { try { return JSON.parse(t.slice(first, last + 1)); } catch { /* continue */ } }
  return null;
}

// ─── Single image analysis ────────────────────────────────────────────────────

async function analyzeImageBuffer(
  image: ImageBuffer,
  client: Anthropic,
  model: string
): Promise<{ ok: true; screen: UiFlowScreen } | { ok: false; error: string }> {
  try {
    const base64 = image.data.toString("base64");
    const mediaType = image.mimeType as
      | "image/png"
      | "image/jpeg"
      | "image/gif"
      | "image/webp";

    const response = await client.messages.create({
      model,
      max_tokens: 3000,
      system: kbPrompt(),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Analyze this UI design artifact and extract documentation-oriented knowledge. Focus on visible screen title, purpose, actions, fields, labels, messages, states, and likely navigation. Return only valid JSON matching the schema.",
            },
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: base64 },
            },
          ],
        },
      ],
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => ("text" in b ? b.text : ""))
      .join("\n")
      .trim();

    const parsed = extractJson(text);
    if (!parsed)
      return { ok: false, error: "Failed to parse AI response as JSON" };

    const screen = normalizeScreen(parsed, image.filename);
    return { ok: true, screen };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Merge screens into KB ────────────────────────────────────────────────────

function mergeScreens(
  projectName: string,
  screens: UiFlowScreen[]
): UiFlowKnowledgeBase {
  const componentSet = new Set<string>();
  const questionSet = new Set<string>();
  const flowMap = new Map<string, UiFlowKnowledgeBase["flows"][0]>();

  for (const screen of screens) {
    screen.components.forEach((c) => c && componentSet.add(c));
    screen.open_questions.forEach((q) => q && questionSet.add(q));

    for (const nav of screen.navigation) {
      const flow = {
        from: screen.screen_title || "Untitled",
        to: nav.destination || "Unknown",
        trigger: nav.trigger || "Unknown",
        confidence: nav.confidence,
      };
      const key = JSON.stringify(flow);
      if (!flowMap.has(key)) flowMap.set(key, flow);
    }
  }

  return {
    project: { name: projectName },
    screens,
    flows: [...flowMap.values()],
    components: [...componentSet],
    open_questions: [...questionSet],
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface RunExtractionOptions {
  images: ImageBuffer[];
  projectName: string;
  apiKey: string;
  model?: string;
}

/**
 * Run UI flow extraction on the provided image buffers.
 * Safe to call from API routes — no filesystem access, no side effects.
 */
export async function runUiFlowExtraction(
  options: RunExtractionOptions
): Promise<UiFlowExtractionResult> {
  const { images, projectName, apiKey, model = "claude-sonnet-4-5" } = options;

  if (images.length === 0) {
    throw new Error("No images provided for extraction");
  }

  const client = new Anthropic({ apiKey });

  const screens: UiFlowScreen[] = [];
  const failures: UiFlowExtractionResult["failures"] = [];

  for (const image of images) {
    const result = await analyzeImageBuffer(image, client, model);
    if (result.ok) {
      screens.push(result.screen);
    } else {
      failures.push({ source_file: image.filename, error: result.error });
    }
  }

  const knowledgebase = mergeScreens(projectName, screens);

  return {
    knowledgebase,
    summary: {
      processed: images.length,
      succeeded: screens.length,
      failed: failures.length,
    },
    failures,
  };
}
