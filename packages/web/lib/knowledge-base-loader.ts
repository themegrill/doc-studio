import { DocumentationKnowledgeBase } from "@/types/knowledge-base";
import { getDb } from "@/lib/db/postgres";
import { getCachedKbPrompt, setCachedKbPrompt } from "@/lib/kb-cache";
import fs from "fs";
import path from "path";

// ─── Types ────────────────────────────────────────────────────────────────────

export type KnowledgeBaseType =
  | "upload"
  | "website"
  | "codebase"
  | "ui_flow"
  | "docs-site";

export interface ProjectKnowledgeBase {
  type: KnowledgeBaseType;
  content: DocumentationKnowledgeBase;
  metadata: Record<string, unknown>;
}

// ─── DB loader ────────────────────────────────────────────────────────────────

/**
 * Load all knowledge bases for a project from the database.
 * Returns one entry per type (upload, website, codebase) that has been saved.
 */
export async function loadAllKnowledgeBases(
  projectSlug: string
): Promise<ProjectKnowledgeBase[]> {
  try {
    const sql = getDb();

    const rows = await sql`
      SELECT pkb.type, pkb.content, pkb.metadata
      FROM project_knowledge_bases pkb
      INNER JOIN projects p ON p.id = pkb.project_id
      WHERE p.slug = ${projectSlug}
      ORDER BY pkb.type
    `;

    if (rows.length > 0) {
      return rows.map((row) => ({
        type: row.type as KnowledgeBaseType,
        content: (typeof row.content === "string"
          ? JSON.parse(row.content)
          : row.content) as DocumentationKnowledgeBase,
        metadata: (typeof row.metadata === "string"
          ? JSON.parse(row.metadata)
          : row.metadata) as Record<string, unknown>,
      }));
    }
  } catch (error) {
    console.error(
      `[KB] Error loading from project_knowledge_bases for ${projectSlug}:`,
      error
    );
  }

  // Fallback: check legacy settings.knowledgeBase on the project row
  try {
    const sql = getDb();
    const [project] = await sql`
      SELECT settings FROM projects WHERE slug = ${projectSlug}
    `;

    if (project) {
      const rawSettings = project.settings;
      let settings =
        typeof rawSettings === "string" ? JSON.parse(rawSettings) : rawSettings;

      // Recover corrupted settings (character-by-character spread artifact)
      if (
        settings &&
        typeof settings === "object" &&
        !settings.knowledgeBase &&
        "0" in settings
      ) {
        try {
          const keys = Object.keys(settings).filter((k) => /^\d+$/.test(k));
          const recoveredJson = keys
            .sort((a, b) => Number(a) - Number(b))
            .map((k) => settings[k])
            .join("");
          const recovered = JSON.parse(recoveredJson);
          if (recovered && typeof recovered === "object") {
            settings = recovered;
          }
        } catch {
          /* ignore recovery failure */
        }
      }

      if (settings?.knowledgeBase) {
        console.log(`[KB] Loaded legacy KB from settings for: ${projectSlug}`);
        return [
          {
            type: "upload",
            content: settings.knowledgeBase as DocumentationKnowledgeBase,
            metadata: {},
          },
        ];
      }
    }
  } catch (error) {
    console.error(
      `[KB] Error loading legacy settings KB for ${projectSlug}:`,
      error
    );
  }

  // Try local file (development override)
  const localKB = loadKnowledgeBase(projectSlug);
  if (localKB) {
    console.log(`[KB] Loaded local file KB for: ${projectSlug}`);
    return [{ type: "upload", content: localKB, metadata: {} }];
  }

  console.log(`[KB] No knowledge base found for project: ${projectSlug}`);
  return [];
}

// ─── Local file loader (dev override) ────────────────────────────────────────

export function loadKnowledgeBase(
  projectSlug: string
): DocumentationKnowledgeBase | null {
  try {
    const candidates = [
      path.join(process.cwd(), "knowledge-base", `${projectSlug}.json`),
      path.join(
        process.cwd(),
        "knowledge-base",
        projectSlug,
        "website-knowledge-base.json"
      ),
    ];

    for (const knowledgeBasePath of candidates) {
      if (fs.existsSync(knowledgeBasePath)) {
        console.log(
          `[KB] Loading local file for: ${projectSlug} (${knowledgeBasePath})`
        );
        return JSON.parse(
          fs.readFileSync(knowledgeBasePath, "utf-8")
        ) as DocumentationKnowledgeBase;
      }
    }
  } catch (error) {
    console.error(`[KB] Error loading local file for ${projectSlug}:`, error);
  }
  return null;
}

// ─── Prompt formatters ────────────────────────────────────────────────────────

/**
 * Format a single knowledge base into a detailed prompt section.
 */
export function formatKnowledgeBasePrompt(
  kb: DocumentationKnowledgeBase
): string {
  const sections: string[] = [];

  sections.push(`# Product: ${kb.plugin.name}`);

  if (kb.plugin.description) {
    sections.push(kb.plugin.description);
  }

  const meta: string[] = [];
  if (kb.plugin.version) meta.push(`Version: ${kb.plugin.version}`);
  if (kb.plugin.author) meta.push(`Author: ${kb.plugin.author}`);
  if (meta.length > 0) sections.push(meta.join(" | "));

  if (kb.plugin.product_summary) {
    const ps = kb.plugin.product_summary;
    sections.push("");
    if (ps.whatItDoes) sections.push(ps.whatItDoes);
    if (ps.targetUsers && ps.targetUsers.length > 0) {
      sections.push(`Target users: ${ps.targetUsers.join(", ")}.`);
    }
  }

  sections.push(`
## Documentation Guidelines

When writing documentation for ${kb.plugin.name}, follow these rules. Only include sections that are relevant to the topic being documented.

### A. Feature Overview
Begin every document with a short explanation of what the feature does and why a user would need it. Keep it to 1–2 paragraphs. Avoid technical jargon unless necessary. If the feature behaves differently in different contexts, mention that upfront.

### B. Availability
State clearly whether the feature is Free or Pro. If Pro, add a \`(PRO)\` label to the headline and mention the plan required (e.g., "This is a Pro feature available in the Personal plan and above.").

### C. Notes and Limitations
Add this section when there are dependencies, edge cases, or special behavior users should know before they start. Keep it short and factual.

### D. Prerequisites
If the feature requires prior setup, list what must be configured first. This prevents confusion and reduces user errors.

### E. Enable the Feature
Explain where the user goes, what they click, and what happens after enabling. Use step-by-step instructions.

### F. Create or Configure the Feature
Describe the main workflow after enabling. Keep each step short — one action per step. Do not combine multiple actions in one step.

### G. Settings Explained
If the feature has multiple options or fields, explain each one under its own subheading. For each setting: explain what it does and how it affects behavior. Avoid vague descriptions like "Used to configure X" — instead say what the setting actually controls.

### H. Usage Sections
If the feature can be used in multiple ways or contexts, add a separate section for each. Each section should include a short explanation, the steps, and what the user will see.

### I. Managing the Feature
After creation, explain where users find and manage the feature. List the available actions (edit, enable/disable, delete, view details, etc.).

### J. Steps Formatting
Whenever listing steps: add a **Steps** heading, keep each step to one action, and use numbered lists.

### K. Navigation Format
Write navigation paths clearly so users know exactly where to go before each step.

### L. Image Placement
Add image placeholders after completing steps, when explaining UI elements, or when showing results. Do not overload with images. Each image must match the steps directly above it.

### M. Writing Style and Tone
- Use simple, clear, professional language.
- Keep sentences short.
- Avoid unnecessary words and marketing tone.
- Focus on helping the user complete the task.
- Avoid AI cliché phrasing (e.g., "It's not just A, it's B").
- Write as if guiding someone step-by-step.

### N. Content Flow
Follow a logical order: overview → availability → prerequisites → enable → configure → settings → manage. Only include sections that apply.

### P. Optional Sections
Add FAQs, Troubleshooting, or Related Documentation only when needed.`);

  sections.push(
    `\n## Product Knowledge\n\nUse the information below when writing documentation. Only reference what is relevant to the topic.`
  );

  if (kb.knowledge.features && kb.knowledge.features.length > 0) {
    sections.push("\n### Features");
    const featuresWithDesc = kb.knowledge.features.filter((f) => f.description);
    if (featuresWithDesc.length > 0) {
      for (const feature of featuresWithDesc) {
        sections.push(`\n**${feature.title}**\n${feature.description}`);
      }
    } else {
      sections.push(
        kb.knowledge.features.map((f) => `- ${f.title}`).join("\n")
      );
    }
  }

  if (kb.knowledge.use_cases && kb.knowledge.use_cases.length > 0) {
    sections.push("\n### Use Cases");
    for (const useCase of kb.knowledge.use_cases) {
      sections.push(`\n**${useCase.title}**`);
      if (useCase.description) sections.push(useCase.description);
    }
  }

  if (kb.knowledge.how_tos && kb.knowledge.how_tos.length > 0) {
    sections.push("\n### How-To Guides");
    for (const howTo of kb.knowledge.how_tos) {
      sections.push(`\n**${howTo.title}**`);
      if (howTo.description) sections.push(howTo.description);
      if (howTo.steps && howTo.steps.length > 0) {
        sections.push("\n**Steps**");
        howTo.steps.forEach((step, i) => sections.push(`${i + 1}. ${step}`));
      }
    }
  }

  if (kb.knowledge.screens && kb.knowledge.screens.length > 0) {
    sections.push("\n### UI Screens");
    for (const screen of kb.knowledge.screens) {
      sections.push(`\n**${screen.title}**`);
      if (screen.purpose) sections.push(`Purpose: ${screen.purpose}`);
      if (screen.user_goal) sections.push(`User goal: ${screen.user_goal}`);
      if (screen.actions?.primary && screen.actions.primary.length > 0) {
        sections.push(`Primary actions: ${screen.actions.primary.join(", ")}`);
      }
      if (screen.actions?.secondary && screen.actions.secondary.length > 0) {
        sections.push(
          `Secondary actions: ${screen.actions.secondary.join(", ")}`
        );
      }
      if (screen.fields && screen.fields.length > 0) {
        sections.push("Fields:");
        for (const field of screen.fields) {
          const required = field.required ? " (required)" : "";
          const help = field.help_text ? ` — ${field.help_text}` : "";
          sections.push(
            `- **${field.label}** [${field.type}]${required}${help}`
          );
        }
      }
    }
  }

  if (kb.knowledge.components && kb.knowledge.components.length > 0) {
    sections.push("\n### UI Components");
    sections.push(kb.knowledge.components.map((c) => `- ${c}`).join("\n"));
  }

  return sections.join("\n");
}

// ─── Label helpers ────────────────────────────────────────────────────────────

function kbTypeLabel(pkb: ProjectKnowledgeBase): string {
  switch (pkb.type) {
    case "upload":
      return "Uploaded Knowledge Base";
    case "website": {
      const url = pkb.metadata.siteLink as string | undefined;
      return url
        ? `Website Knowledge Base (source: ${url})`
        : "Website Knowledge Base";
    }
    case "codebase": {
      const repo = pkb.metadata.githubRepo as string | undefined;
      const branch = pkb.metadata.branch as string | undefined;
      return repo
        ? `Codebase Knowledge Base (GitHub: ${repo}${
            branch ? `, branch: ${branch}` : ""
          })`
        : "Codebase Knowledge Base";
    }
    case "ui_flow":
      return "UI Flow Knowledge Base (extracted from UI design images)";
    case "docs-site":
      return "Imported Docs Knowledge Base (extracted from previous documentation site)";
  }
}

// ─── Website KB formatter ─────────────────────────────────────────────────────

/**
 * Format a website knowledge base (array format) into a prompt section.
 */
function formatWebsiteKnowledgeBasePrompt(content: unknown): string {
  const entries = Array.isArray(content) ? content : [content];
  const sections: string[] = [];

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;

    const ps = e.productSummary as Record<string, unknown> | undefined;
    if (ps) {
      if (ps.productName) sections.push(`# Product: ${ps.productName}`);
      if (ps.oneSentenceSummary) sections.push(ps.oneSentenceSummary as string);
      if (ps.whatItDoes) sections.push(ps.whatItDoes as string);
      if (Array.isArray(ps.targetUsers) && ps.targetUsers.length > 0) {
        sections.push(
          `Target users: ${(ps.targetUsers as string[]).join(", ")}.`
        );
      }
    }

    if (Array.isArray(e.features) && e.features.length > 0) {
      sections.push("\n### Features");
      for (const f of e.features) {
        const feat = f as Record<string, unknown>;
        if (feat.name) {
          sections.push(`\n**${feat.name}**`);
          if (feat.description) sections.push(feat.description as string);
        }
      }
    }

    if (Array.isArray(e.howTos) && e.howTos.length > 0) {
      sections.push("\n### How-To Guides");
      for (const h of e.howTos) {
        const howTo = h as Record<string, unknown>;
        if (howTo.title) {
          sections.push(`\n**${howTo.title}**`);
          if (howTo.description) sections.push(howTo.description as string);
          if (Array.isArray(howTo.steps) && howTo.steps.length > 0) {
            sections.push("\n**Steps**");
            (howTo.steps as string[]).forEach((step, i) =>
              sections.push(`${i + 1}. ${step}`)
            );
          }
        }
      }
    }
  }

  return sections.join("\n");
}

// ─── UI Flow KB formatter ─────────────────────────────────────────────────────

/**
 * Format a UI flow knowledge base (produced by the vision extractor) into a
 * prompt section the AI can use when writing documentation.
 */
function formatUiFlowKnowledgeBasePrompt(content: unknown): string {
  if (!content || typeof content !== "object" || Array.isArray(content))
    return "";
  const kb = content as Record<string, unknown>;
  const sections: string[] = [];

  const project = kb.project as Record<string, unknown> | undefined;
  if (project?.name) sections.push(`# Product UI Flows: ${project.name}`);

  // Screens
  const screens = Array.isArray(kb.screens) ? kb.screens : [];
  if (screens.length > 0) {
    sections.push("\n## UI Screens\n");
    for (const s of screens) {
      if (!s || typeof s !== "object") continue;
      const screen = s as Record<string, unknown>;
      if (!screen.screen_title) continue;

      sections.push(`### ${screen.screen_title}`);
      if (screen.screen_purpose)
        sections.push(`**Purpose:** ${screen.screen_purpose}`);
      if (screen.user_goal) sections.push(`**User Goal:** ${screen.user_goal}`);

      const primary = Array.isArray(screen.primary_actions)
        ? screen.primary_actions.filter(Boolean)
        : [];
      if (primary.length > 0)
        sections.push(`**Primary Actions:** ${primary.join(", ")}`);

      const secondary = Array.isArray(screen.secondary_actions)
        ? screen.secondary_actions.filter(Boolean)
        : [];
      if (secondary.length > 0)
        sections.push(`**Secondary Actions:** ${secondary.join(", ")}`);

      const fields = Array.isArray(screen.fields) ? screen.fields : [];
      if (fields.length > 0) {
        sections.push("**Fields:**");
        for (const f of fields) {
          const field = f as Record<string, unknown>;
          if (!field.label) continue;
          const req = field.required ? " (required)" : "";
          const help = field.help_text ? ` — ${field.help_text}` : "";
          sections.push(`- **${field.label}** [${field.type}]${req}${help}`);
        }
      }

      const content = screen.content as Record<string, unknown> | undefined;
      const headings = Array.isArray(content?.headings)
        ? content.headings.filter(Boolean)
        : [];
      if (headings.length > 0)
        sections.push(`**Headings:** ${headings.join(", ")}`);

      const messages = Array.isArray(content?.messages)
        ? content.messages.filter(Boolean)
        : [];
      if (messages.length > 0)
        sections.push(`**Messages:** ${messages.join("; ")}`);

      const states = screen.states as Record<string, unknown> | undefined;
      const errorStates = Array.isArray(states?.error)
        ? states.error.filter(Boolean)
        : [];
      if (errorStates.length > 0)
        sections.push(`**Error States:** ${errorStates.join("; ")}`);
      const successStates = Array.isArray(states?.success)
        ? states.success.filter(Boolean)
        : [];
      if (successStates.length > 0)
        sections.push(`**Success States:** ${successStates.join("; ")}`);

      const notes = Array.isArray(screen.documentation_notes)
        ? screen.documentation_notes.filter(Boolean)
        : [];
      if (notes.length > 0) {
        sections.push("**Documentation Notes:**");
        notes.forEach((n) => sections.push(`- ${n}`));
      }

      sections.push("");
    }
  }

  // Flows
  const flows = Array.isArray(kb.flows) ? kb.flows : [];
  if (flows.length > 0) {
    sections.push("## Navigation Flows\n");
    for (const f of flows) {
      const flow = f as Record<string, unknown>;
      if (flow.from && flow.to) {
        sections.push(
          `- **${flow.from}** → **${flow.to}** (trigger: ${
            flow.trigger || "unknown"
          }, confidence: ${flow.confidence || "low"})`
        );
      }
    }
    sections.push("");
  }

  // Global components
  const components = Array.isArray(kb.components)
    ? kb.components.filter(Boolean)
    : [];
  if (components.length > 0) {
    sections.push(
      `## UI Components\n${components.map((c) => `- ${c}`).join("\n")}`
    );
  }

  return sections.join("\n");
}

// ─── Codebase KB formatter ───────────────────────────────────────────────────

/**
 * Format a codebase knowledge base (compacted/minified format with abbreviated
 * keys) into a prompt section. The compaction schema is included so the AI can
 * expand abbreviated keys while reading the JSON data.
 *
 * Compaction rules (applied at generation time, must be reversed by reader):
 *  - All keys are shortened via a _schema map stored at the top of the file.
 *  - Missing keys mean empty array / null / false (never written explicitly).
 *  - The file is minified JSON — parse first, then apply key expansion.
 */
function formatCodebaseKnowledgeBasePrompt(
  content: unknown,
  metadata: Record<string, unknown>
): string {
  const sections: string[] = [];

  const repo = metadata.githubRepo as string | undefined;
  const branch = metadata.branch as string | undefined;
  const label = repo
    ? `Codebase Knowledge Base (GitHub: ${repo}${branch ? `, branch: ${branch}` : ""})`
    : "Codebase Knowledge Base";

  sections.push(`# ${label}`);
  sections.push(`
This knowledge base is stored in a compacted format with abbreviated keys.
Use the schema below to expand each key to its full name before interpreting the data.

## Key Abbreviation Schema

**Top-level section keys:**
pn → plugin_name | ga → generated_at | ua → updated_at | bi → batch_info |
pm → plugin_metadata | tf → task_flows | ue → ui_elements | gl → glossary_terms |
er → error_messages | ft → features | mn → menus | md → modules | ad → addons |
fs → form_settings | gs → global_settings | wf → workflows | sc → shortcodes |
hk → hooks | fl → filters | ae → api_endpoints | pt → post_types |
cn → constants | fn → functions | cl → classes

**batch_info fields:** bn → batch_number | tb → total_batches

**plugin_metadata fields:** rp → requires_php | tu → tested_up_to | st → stable_tag |
wt → wp_tested_up_to | sd → short_description

**Shared fields (modules, addons, settings, task_flows, etc.):**
n → name | pu → purpose | ud → user_description | kc → key_classes |
hu → hooks_used | se → settings | u → ui_flow | d → dependencies |
pl → plan | dl → doc_link | pr → prerequisites | gk → gotchas

**Setting fields:** k → key | l → label | t → type | v → default |
ds → description | ui → user_impact | ap → applies_to | sc → scope | o → options

**Menu fields:** mt → type | mp → parent | ps → page_slug | lt → title |
cp → capability | tb2 → tab | sx → section

**UI element screen fields:** sr → screen | el → elements | ht → help_text

**Task flow fields:** tk → task | ct → category | df → difficulty | sp → steps | oc → outcome

**Workflow fields:** tr → trigger | vp → validation_points | dg → data_storage | rs → response

**Shortcode fields:** tg → tag | at → attributes | ex → example

**Glossary fields:** gm → term | gd → definition | gc → context

**Error message fields:** em → message | eg → trigger | er_res → resolution

**Function / class fields:** n → name | fs → summary

## Missing Key Rule
Any absent field should be treated as: arrays → [] | strings → null | booleans → false

## Compacted Knowledge Base Data
`);

  sections.push("```json");
  sections.push(JSON.stringify(content));
  sections.push("```");

  return sections.join("\n");
}

// ─── Docs-site KB formatter ───────────────────────────────────────────────────

/**
 * Format a 'docs-site' knowledge base (extracted from a BetterDocs CSV via
 * Claude AI) into a prompt section. Includes a staleness disclaimer so the AI
 * writing assistant knows to treat UI-specific details with caution.
 */
function formatDocsSiteKnowledgeBasePrompt(content: unknown): string {
  if (!content || typeof content !== "object" || Array.isArray(content))
    return "";
  const kb = content as Record<string, unknown>;
  const sections: string[] = [];

  sections.push(
    `# Imported Docs Knowledge Base\n\n` +
      `> **Important:** This knowledge base was extracted from a previous documentation site using AI. ` +
      `Some information may be outdated — UI menu paths, button labels, and screen layouts may have changed. ` +
      `Use this as a conceptual reference. Always cross-check UI-specific details against current product information ` +
      `and flag anything uncertain rather than stating it as fact.`
  );

  const docs = Array.isArray(kb.documents) ? kb.documents : [];
  if (docs.length > 0) {
    sections.push("\n## Documentation Knowledge\n");
    for (const d of docs) {
      if (!d || typeof d !== "object") continue;
      const doc = d as Record<string, unknown>;
      const title =
        (doc.title as string) || (doc.original_title as string) || "";
      if (!title) continue;

      sections.push(`### ${title}`);
      if (doc.summary) sections.push(doc.summary as string);

      if (doc.feature_or_topic) {
        sections.push(`**Feature/Topic:** ${doc.feature_or_topic}`);
      }

      const concepts = Array.isArray(doc.key_concepts)
        ? doc.key_concepts.filter(Boolean)
        : [];
      if (concepts.length > 0) {
        sections.push(`**Key Concepts:** ${concepts.join(", ")}`);
      }

      const prereqs = Array.isArray(doc.prerequisites)
        ? doc.prerequisites.filter(Boolean)
        : [];
      if (prereqs.length > 0) {
        sections.push("**Prerequisites:**");
        prereqs.forEach((p) => sections.push(`- ${p}`));
      }

      const steps = Array.isArray(doc.steps_or_instructions)
        ? doc.steps_or_instructions.filter(Boolean)
        : [];
      if (steps.length > 0) {
        sections.push("**How it works:**");
        steps.forEach((s, i) => sections.push(`${i + 1}. ${s}`));
      }

      const notes = Array.isArray(doc.important_notes)
        ? doc.important_notes.filter(Boolean)
        : [];
      if (notes.length > 0) {
        sections.push("**Important Notes:**");
        notes.forEach((n) => sections.push(`- ${n}`));
      }

      const configOpts = Array.isArray(doc.configuration_options)
        ? doc.configuration_options
        : [];
      if (configOpts.length > 0) {
        sections.push("**Configuration Options:**");
        for (const opt of configOpts) {
          const o = opt as Record<string, unknown>;
          if (o.name) sections.push(`- **${o.name}**: ${o.description || ""}`);
        }
      }

      const stale = Array.isArray(doc.staleness_flags)
        ? doc.staleness_flags.filter(Boolean)
        : [];
      if (stale.length > 0) {
        sections.push(
          `**Potentially outdated (verify before using):** ${stale.join("; ")}`
        );
      }

      if (doc.confidence && doc.confidence !== "high") {
        sections.push(`**Extraction confidence:** ${doc.confidence}`);
      }

      sections.push("");
    }
  }

  const faqs = Array.isArray(kb.faqs) ? kb.faqs : [];
  if (faqs.length > 0) {
    sections.push("## FAQs\n");
    for (const f of faqs) {
      const faq = f as Record<string, unknown>;
      if (faq.question && faq.answer) {
        sections.push(`**Q: ${faq.question}**`);
        sections.push(`A: ${faq.answer}`);
        sections.push("");
      }
    }
  }

  return sections.join("\n");
}

// ─── Format dispatcher ────────────────────────────────────────────────────────

/**
 * Pick the right formatter based on KB type and content structure.
 */
function formatKbContent(pkb: ProjectKnowledgeBase): string {
  if (pkb.type === "ui_flow") {
    return formatUiFlowKnowledgeBasePrompt(pkb.content as unknown);
  }

  if (pkb.type === "docs-site") {
    return formatDocsSiteKnowledgeBasePrompt(pkb.content as unknown);
  }

  if (pkb.type === "codebase") {
    return formatCodebaseKnowledgeBasePrompt(pkb.content as unknown, pkb.metadata);
  }
  const c = pkb.content as unknown;
  if (
    c &&
    typeof c === "object" &&
    !Array.isArray(c) &&
    (c as Record<string, unknown>).plugin
  ) {
    return formatKnowledgeBasePrompt(pkb.content);
  }
  return formatWebsiteKnowledgeBasePrompt(c);
}

// ─── Combined prompt builder ──────────────────────────────────────────────────

/**
 * Build a combined knowledge-base prompt from all KB entries for a project.
 * Each KB type gets its own labelled section so the AI can distinguish sources.
 */
export function formatAllKnowledgeBasesPrompt(
  kbs: ProjectKnowledgeBase[]
): string {
  if (kbs.length === 0) return "";

  if (kbs.length === 1) {
    return formatKbContent(kbs[0]);
  }

  const parts: string[] = [];
  for (const pkb of kbs) {
    parts.push(`## ${kbTypeLabel(pkb)}\n`);
    parts.push(formatKbContent(pkb));
    parts.push("\n---\n");
  }
  return parts.join("\n");
}

// ─── Public convenience functions ─────────────────────────────────────────────

/**
 * Load and format all knowledge bases for a project into a prompt string.
 * This is the primary function used by the AI chat route.
 *
 * Results are cached in memory per project slug. The cache is invalidated
 * by `invalidateKbCache()` whenever a KB source is updated by an admin.
 */
export async function getKnowledgeBasePromptAsync(
  projectSlug: string | null | undefined
): Promise<string> {
  if (!projectSlug) return "";

  const cached = getCachedKbPrompt(projectSlug);
  if (cached !== null) {
    console.log(`[KB] Cache hit for: ${projectSlug} (${cached.length} chars)`);
    return cached;
  }

  const kbs = await loadAllKnowledgeBases(projectSlug);
  const prompt = formatAllKnowledgeBasesPrompt(kbs);

  setCachedKbPrompt(projectSlug, prompt);
  console.log(`[KB] Cache populated for: ${projectSlug} (${prompt.length} chars)`);
  return prompt;
}

/**
 * Synchronous local-only version (dev / fallback).
 */
export function getKnowledgeBasePrompt(
  projectSlug: string | null | undefined
): string {
  if (!projectSlug) return "";

  const kb = loadKnowledgeBase(projectSlug);
  if (!kb) return "";

  return formatKnowledgeBasePrompt(kb);
}
