/**
 * Loading and saving the editorial guidelines (DOCSTUDIO-45). Server-only.
 *
 * Resolution order, each layer merged over the previous:
 *   1. DEFAULT_GUIDELINES              — the guideline as written
 *   2. global_settings["editorial.guidelines"]  — the org-wide settings screen
 *   3. projects.settings.editorialGuidelines    — the per-project Guidelines tab
 *
 * The per-project layer exists because DocStudio hosts several products: the
 * 50–60 character band is universal, but the site-name suffix, the brand
 * mention and the approved category list are not.
 */

import { cache } from "react";
import { getDb } from "@/lib/db/postgres";
import { getSetting, setSetting } from "@/lib/settings";
import {
  DEFAULT_GUIDELINES,
  EditorialGuidelinesSchema,
  GUIDELINES_SETTINGS_CATEGORY,
  GUIDELINES_SETTINGS_KEY,
  mergeGuidelines,
  type EditorialGuidelines,
} from "./guidelines";

export const PROJECT_GUIDELINES_KEY = "editorialGuidelines";

/**
 * The org-wide layer, without any project override applied.
 *
 * Wrapped in React's `cache` so the settings row is read once per request
 * rather than once per call site — `generateMetadata` now needs the guidelines
 * on every public doc page render, and without this each render paid for an
 * extra query.
 */
async function readGlobalGuidelines(): Promise<EditorialGuidelines> {
  const stored = await getSetting<unknown>(GUIDELINES_SETTINGS_KEY, null);
  return mergeGuidelines(DEFAULT_GUIDELINES, stored);
}

export const getGlobalGuidelines = cache(readGlobalGuidelines);

export async function setGlobalGuidelines(
  patch: unknown,
): Promise<EditorialGuidelines> {
  // Uncached read: within one request the cached reader would still hold the
  // pre-write value, and we would merge the patch onto stale data.
  const merged = mergeGuidelines(await readGlobalGuidelines(), patch);
  await setSetting(
    GUIDELINES_SETTINGS_KEY,
    merged,
    GUIDELINES_SETTINGS_CATEGORY,
    "Documentation editorial guidelines (DOCSTUDIO-45)",
  );
  return merged;
}

/** The raw per-project override, for rendering the project Guidelines tab. */
async function readProjectOverride(
  projectSlug: string,
): Promise<Record<string, unknown>> {
  const sql = getDb();
  const [project] = await sql`
    SELECT settings FROM projects WHERE slug = ${projectSlug}
  `;
  const raw = project?.settings;
  const settings =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const override = settings[PROJECT_GUIDELINES_KEY];
  return override && typeof override === "object"
    ? (override as Record<string, unknown>)
    : {};
}

export const getProjectOverride = cache(readProjectOverride);

export async function setProjectOverride(
  projectSlug: string,
  patch: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const sql = getDb();
  // Uncached, for the same reason as setGlobalGuidelines.
  const merged = { ...(await readProjectOverride(projectSlug)), ...patch };

  // Must go through sql.json(): passing a pre-stringified payload makes the
  // driver encode it a second time, so Postgres stores a jsonb *string* rather
  // than an object — and `jsonb || <string>` concatenates into an array instead
  // of merging, silently corrupting the column. The cast below borrows the
  // driver's own accepted type, which `Record<string, unknown>` does not satisfy.
  const payload = { [PROJECT_GUIDELINES_KEY]: merged } as Parameters<
    typeof sql.json
  >[0];

  await sql`
    UPDATE projects
    SET settings = COALESCE(settings, '{}'::jsonb) || ${sql.json(payload)}::jsonb,
        updated_at = NOW()
    WHERE slug = ${projectSlug}
  `;

  return merged;
}

/**
 * The effective guidelines for a document — what the editor, the AI prompts and
 * the upload validator all read. Pass a project slug wherever one is known.
 */
async function readGuidelines(
  projectSlug?: string | null,
): Promise<EditorialGuidelines> {
  const global = await readGlobalGuidelines();
  if (!projectSlug) return global;

  try {
    return mergeGuidelines(global, await readProjectOverride(projectSlug));
  } catch (error) {
    console.error(
      `[editorial] Failed to load project guidelines for "${projectSlug}":`,
      error,
    );
    return global;
  }
}

export const getGuidelines = cache(readGuidelines);

/**
 * Uncached effective guidelines. Use this only immediately after a write —
 * everywhere else `getGuidelines` avoids repeating the queries within a request.
 */
export const getGuidelinesFresh = readGuidelines;

/** Validate an incoming patch from the settings screen before it is stored. */
export function validateGuidelinesPatch(patch: unknown) {
  return EditorialGuidelinesSchema.partial().safeParse(patch);
}
