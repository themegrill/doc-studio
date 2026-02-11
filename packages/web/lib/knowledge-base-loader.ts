import { DocumentationKnowledgeBase } from "@/types/knowledge-base";
import { getKnowledgeBaseFromGitHub } from "./github-kb-fetcher";
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
    const knowledgeBasePath = path.join(
      process.cwd(),
      "knowledge-base",
      `${projectSlug}.json`
    );

    if (fs.existsSync(knowledgeBasePath)) {
      console.log(`[KB] Loading local knowledge base for: ${projectSlug}`);
      const fileContent = fs.readFileSync(knowledgeBasePath, "utf-8");
      const knowledgeBase: DocumentationKnowledgeBase = JSON.parse(fileContent);
      return knowledgeBase;
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
 * Load knowledge base asynchronously (tries GitHub)
 *
 * @param projectSlug - The project slug
 * @returns Knowledge base object or null if not found
 */
export async function loadKnowledgeBaseAsync(
  projectSlug: string
): Promise<DocumentationKnowledgeBase | null> {
  // Try local file first
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
    console.error(
      `[KB] Error fetching from GitHub for ${projectSlug}:`,
      error
    );
  }

  console.log(`[KB] No knowledge base found for project: ${projectSlug}`);
  return null;
}

/**
 * Format knowledge base into a prompt string for the AI assistant
 *
 * This converts the structured knowledge base into natural language
 * that the AI can understand and use when generating documentation.
 */
export function formatKnowledgeBasePrompt(
  kb: DocumentationKnowledgeBase
): string {
  const sections: string[] = [];

  // Product Information
  sections.push(`## Product: ${kb.product.name}`);
  if (kb.product.description) {
    sections.push(kb.product.description);
  }
  if (kb.product.version) {
    sections.push(`Current Version: ${kb.product.version}`);
  }

  // Writing Guidelines
  if (kb.writingGuidelines) {
    sections.push("\n## Writing Guidelines");

    if (kb.writingGuidelines.tone) {
      sections.push(`**Tone:** ${kb.writingGuidelines.tone}`);
    }

    if (kb.writingGuidelines.voicePreference) {
      sections.push(
        `**Voice:** Use ${kb.writingGuidelines.voicePreference} voice`
      );
    }

    if (kb.writingGuidelines.technicalLevel) {
      sections.push(
        `**Audience Level:** ${kb.writingGuidelines.technicalLevel}`
      );
    }

    if (kb.writingGuidelines.formatting) {
      const fmt = kb.writingGuidelines.formatting;
      if (fmt.headingStyle) {
        sections.push(`**Heading Style:** ${fmt.headingStyle}`);
      }
      if (fmt.codeBlockLanguage) {
        sections.push(
          `**Default Code Language:** ${fmt.codeBlockLanguage}`
        );
      }
      if (fmt.useEmojis !== undefined) {
        sections.push(
          `**Use Emojis:** ${fmt.useEmojis ? "Yes" : "No"}`
        );
      }
    }
  }

  // Terminology
  if (kb.terminology && Object.keys(kb.terminology).length > 0) {
    sections.push("\n## Terminology Standards");
    sections.push(
      "Use these exact terms in documentation (avoid the alternatives):"
    );

    for (const [key, term] of Object.entries(kb.terminology)) {
      sections.push(`\n**${term.preferredTerm}**`);
      if (term.definition) {
        sections.push(`- Definition: ${term.definition}`);
      }
      if (term.avoid && term.avoid.length > 0) {
        sections.push(`- Avoid using: ${term.avoid.join(", ")}`);
      }
      if (term.usage) {
        sections.push(`- Example: "${term.usage}"`);
      }
    }
  }

  // Common Sections
  if (kb.commonSections && Object.keys(kb.commonSections).length > 0) {
    sections.push("\n## Standard Documentation Sections");
    sections.push(
      "Include these sections in documentation when relevant:"
    );

    for (const [sectionName, sectionInfo] of Object.entries(
      kb.commonSections
    )) {
      if (!sectionInfo) continue;

      sections.push(
        `\n**${sectionName}**${sectionInfo.required ? " (Required)" : ""}`
      );

      if (sectionInfo.subsections && sectionInfo.subsections.length > 0) {
        sections.push(
          `Subsections: ${sectionInfo.subsections.join(", ")}`
        );
      }

      if (sectionInfo.template) {
        sections.push("Template:");
        sections.push("```");
        sections.push(sectionInfo.template);
        sections.push("```");
      }
    }
  }

  // Features
  if (kb.features && Object.keys(kb.features).length > 0) {
    sections.push("\n## Product Features");
    sections.push("Reference these features when writing documentation:");

    for (const [featureKey, feature] of Object.entries(kb.features)) {
      sections.push(`\n**${feature.name}**`);
      sections.push(`- ${feature.description}`);

      if (feature.category) {
        sections.push(`- Category: ${feature.category}`);
      }

      if (feature.isPro) {
        sections.push("- **Pro Feature** (requires premium version)");
      }

      if (feature.keywords && feature.keywords.length > 0) {
        sections.push(`- Keywords: ${feature.keywords.join(", ")}`);
      }

      if (
        feature.relatedFeatures &&
        feature.relatedFeatures.length > 0
      ) {
        sections.push(
          `- Related: ${feature.relatedFeatures.join(", ")}`
        );
      }
    }
  }

  // Code Examples
  if (kb.codeExamples && Object.keys(kb.codeExamples).length > 0) {
    sections.push("\n## Common Code Examples");
    sections.push(
      "Use these code examples as references when users ask for implementation details:"
    );

    for (const [exampleKey, example] of Object.entries(kb.codeExamples)) {
      if (example.description) {
        sections.push(`\n**${example.description}**`);
      }

      sections.push("```" + example.language);
      sections.push(example.code);
      sections.push("```");

      if (example.tags && example.tags.length > 0) {
        sections.push(`Tags: ${example.tags.join(", ")}`);
      }
    }
  }

  // FAQs
  if (kb.faqs && kb.faqs.length > 0) {
    sections.push("\n## Frequently Asked Questions");
    sections.push(
      "Reference these common questions and answers when helping users:"
    );

    for (const faq of kb.faqs) {
      sections.push(`\n**Q: ${faq.question}**`);
      sections.push(`A: ${faq.answer}`);
      if (faq.category) {
        sections.push(`Category: ${faq.category}`);
      }
    }
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
