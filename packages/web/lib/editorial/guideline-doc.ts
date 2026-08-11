/**
 * Loads the prose documentation style guide from disk (DOCSTUDIO-45). Server-only.
 *
 * Extracted from app/api/ai/doc-chat/route.ts, which was the only consumer. The
 * mechanism was already good — a global guideline with a per-project override,
 * injected into the system prompt behind a cache breakpoint — it was simply not
 * reachable from the five one-shot AI routes, each of which carried its own
 * hand-written instructions instead. Now they all read the same file.
 *
 * Two layers of guidance, deliberately kept apart:
 *   - this file  → the prose ("be task-first", "explain the outcome")
 *   - prompt.ts  → the checkable numbers, rendered from the settings object
 */

import fs from "fs";
import path from "path";

const GUIDELINE_FILENAME = "documentation-guideline.md";

/**
 * Org-wide rules a project may NOT replace. Kept in a separate file precisely
 * because a project guideline overrides the global one — when the DOCSTUDIO-45
 * rules lived in documentation-guideline.md, every project with its own file
 * (user-registration, for one) silently lost them.
 */
const STANDARDS_FILENAME = "editorial-standards.md";

function readIfPresent(filePath: string, label: string): string {
  try {
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : "";
  } catch (error) {
    console.error(`[editorial] Failed to load ${label} guideline:`, error);
    return "";
  }
}

export interface GuidelineMarkdown {
  /** Org-wide editorial standards. Always applies — never overridden. */
  standards: string;
  /** The org-wide house style guide, or "" when the file is absent. */
  global: string;
  /** The project-specific house style guide, or "" when there is none. */
  project: string;
  /**
   * The house style to send. A project guideline overrides the global one
   * rather than appending to it — existing doc-chat behaviour that projects
   * such as user-registration rely on. `standards` is sent *in addition* to
   * this, whichever way it resolves.
   */
  effective: string;
}

export function loadGuidelineMarkdown(
  projectSlug?: string | null,
): GuidelineMarkdown {
  const root = path.join(process.cwd(), "template");

  const standards = readIfPresent(
    path.join(root, STANDARDS_FILENAME),
    "editorial standards",
  );

  const global = readIfPresent(path.join(root, GUIDELINE_FILENAME), "global");

  const project = projectSlug
    ? readIfPresent(
        path.join(root, projectSlug, GUIDELINE_FILENAME),
        `project "${projectSlug}"`,
      )
    : "";

  return { standards, global, project, effective: project || global };
}

/**
 * A trimmed slice of the style guide for the short one-shot calls (title,
 * description, meta title, meta description). The full guide runs to several
 * hundred lines, which is worth sending for a chat turn that rewrites whole
 * sections but is disproportionate for generating a single line of text.
 *
 * Returns "" when nothing relevant is found, in which case the caller relies on
 * renderGuidelinesPrompt() alone.
 */
export function guidelineExcerpt(
  markdown: string,
  maxChars = 2000,
): string {
  if (!markdown.trim()) return "";
  const trimmed = markdown.trim();
  if (trimmed.length <= maxChars) return trimmed;
  // Cut at a heading boundary so the excerpt never ends mid-rule.
  const slice = trimmed.slice(0, maxChars);
  const lastHeading = slice.lastIndexOf("\n#");
  return (lastHeading > maxChars / 2 ? slice.slice(0, lastHeading) : slice).trim();
}
