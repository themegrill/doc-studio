import { DocumentationKnowledgeBase } from "@/types/knowledge-base";
import { getKnowledgeBaseFromGitHub } from "./github-kb-fetcher";
import { getDb } from "@/lib/db/postgres";
import fs from "fs";
import path from "path";

/**
 * Load knowledge base for a specific project
 *
 * This function tries to load from:
 * 1. Local knowledge-base directory (for custom/override files)
 * 2. GitHub repository cache (fetched from themegrill/knowledge-base)
 *
 * @param projectSlug - The project slug (e.g., 'user-registration-pro')
 * @returns Knowledge base object or null if not found
 */
export function loadKnowledgeBase(
  projectSlug: string
): DocumentationKnowledgeBase | null {
  // Try local file first (for custom overrides)
  try {
    // Check both the flat path and the crawl-output subdirectory path
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
          `[KB] Loading local knowledge base for: ${projectSlug} (${knowledgeBasePath})`
        );
        const fileContent = fs.readFileSync(knowledgeBasePath, "utf-8");
        const knowledgeBase: DocumentationKnowledgeBase =
          JSON.parse(fileContent);
        return knowledgeBase;
      }
    }
  } catch (error) {
    console.error(
      `[KB] Error loading local knowledge base for ${projectSlug}:`,
      error
    );
  }

  // Local file not found, will try GitHub in async function
  return null;
}

/**
 * Load knowledge base asynchronously (tries DB, local file, then GitHub)
 *
 * @param projectSlug - The project slug
 * @returns Knowledge base object or null if not found
 */
export async function loadKnowledgeBaseAsync(
  projectSlug: string
): Promise<DocumentationKnowledgeBase | null> {
  // Try database first (works in all environments including Vercel)
  try {
    const sql = getDb();
    const [project] = await sql`
      SELECT settings FROM projects WHERE slug = ${projectSlug}
    `;

    const settings =
      typeof project?.settings === "string"
        ? JSON.parse(project.settings)
        : project?.settings;
    if (settings?.knowledgeBase) {
      console.log(`[KB] Loaded from database for: ${projectSlug}`);
      return settings.knowledgeBase as DocumentationKnowledgeBase;
    }
  } catch (error) {
    console.error(
      `[KB] Error loading from database for ${projectSlug}:`,
      error
    );
  }

  // Try local file (for local development overrides)
  const localKB = loadKnowledgeBase(projectSlug);
  if (localKB) {
    return localKB;
  }

  // Try GitHub
  try {
    console.log(`[KB] Fetching from GitHub for: ${projectSlug}`);
    const githubKB = await getKnowledgeBaseFromGitHub(projectSlug);
    if (githubKB) {
      console.log(`[KB] Successfully loaded from GitHub: ${projectSlug}`);
      return githubKB;
    }
  } catch (error) {
    console.error(`[KB] Error fetching from GitHub for ${projectSlug}:`, error);
  }

  console.log(`[KB] No knowledge base found for project: ${projectSlug}`);
  return null;
}

/**
 * Format knowledge base into a prompt string for the AI assistant
 *
 * Produces a system prompt that gives the AI product context and instructs
 * it to write documentation following the plugin documentation guidelines
 * (sections A–P: overview, availability, prerequisites, steps, settings, etc.)
 */
export function formatKnowledgeBasePrompt(
  kb: DocumentationKnowledgeBase
): string {
  const sections: string[] = [];

  // ─── Product Context ────────────────────────────────────────────────────────

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
      sections.push(
        `Target users: ${ps.targetUsers.join(", ")}.`
      );
    }
  }

  // ─── Documentation Writing Guidelines ───────────────────────────────────────

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

  // ─── Product Knowledge ───────────────────────────────────────────────────────

  sections.push(`\n## Product Knowledge\n\nUse the information below when writing documentation. Only reference what is relevant to the topic.`);

  // Features
  if (kb.knowledge.features && kb.knowledge.features.length > 0) {
    sections.push("\n### Features");
    const featuresWithDesc = kb.knowledge.features.filter((f) => f.description);
    if (featuresWithDesc.length > 0) {
      for (const feature of featuresWithDesc) {
        sections.push(`\n**${feature.title}**\n${feature.description}`);
      }
    } else {
      sections.push(kb.knowledge.features.map((f) => `- ${f.title}`).join("\n"));
    }
  }

  // Use Cases
  if (kb.knowledge.use_cases && kb.knowledge.use_cases.length > 0) {
    sections.push("\n### Use Cases");
    for (const useCase of kb.knowledge.use_cases) {
      sections.push(`\n**${useCase.title}**`);
      if (useCase.description) sections.push(useCase.description);
    }
  }

  // How-To Guides (steps reference for sections E, F, J)
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

  // UI Screens (reference for sections E, F, G, K, L)
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
        sections.push(`Secondary actions: ${screen.actions.secondary.join(", ")}`);
      }
      if (screen.fields && screen.fields.length > 0) {
        sections.push("Fields:");
        for (const field of screen.fields) {
          const required = field.required ? " (required)" : "";
          const help = field.help_text ? ` — ${field.help_text}` : "";
          sections.push(`- **${field.label}** [${field.type}]${required}${help}`);
        }
      }
    }
  }

  // UI Components (reference for sections G, L)
  if (kb.knowledge.components && kb.knowledge.components.length > 0) {
    sections.push("\n### UI Components");
    sections.push(kb.knowledge.components.map((c) => `- ${c}`).join("\n"));
  }

  return sections.join("\n");
}

/**
 * Get knowledge base prompt for a project (async version - recommended)
 *
 * Convenience function that loads and formats the knowledge base
 */
export async function getKnowledgeBasePromptAsync(
  projectSlug: string | null | undefined
): Promise<string> {
  if (!projectSlug) {
    return "";
  }

  const kb = await loadKnowledgeBaseAsync(projectSlug);
  if (!kb) {
    return "";
  }

  return formatKnowledgeBasePrompt(kb);
}

/**
 * Get knowledge base prompt for a project (sync version - local only)
 *
 * This only checks local files and doesn't fetch from GitHub.
 * Use getKnowledgeBasePromptAsync for full functionality.
 */
export function getKnowledgeBasePrompt(
  projectSlug: string | null | undefined
): string {
  if (!projectSlug) {
    return "";
  }

  const kb = loadKnowledgeBase(projectSlug);
  if (!kb) {
    return "";
  }

  return formatKnowledgeBasePrompt(kb);
}
