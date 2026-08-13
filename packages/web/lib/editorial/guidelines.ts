/**
 * Editorial Guidelines — the single source of truth (DOCSTUDIO-45)
 *
 * Every number and list from the documentation style guide lives here, once.
 * Three things read from this object and nothing else:
 *   1. the editor hints and pre-publish checklist  (lib/editorial/rules.ts)
 *   2. the instructions sent to Claude             (lib/editorial/prompt.ts)
 *   3. the image upload validator                  (app/api/upload/route.ts)
 *
 * Values are overridable at runtime — see lib/editorial/config.ts — so the SEO
 * and Documentation teams can change a rule from the settings screen without a
 * deployment. Defaults below are the guideline as written; where the guideline
 * states a principle but no checkable value, the default is marked PROPOSED and
 * is awaiting an answer from the owning team.
 */

import { z } from "zod";

export const EditorialGuidelinesSchema = z.object({
  title: z.object({
    /**
     * Editorial concision, derived from the guideline's own examples table:
     * its preferred titles run to 4 words, its avoided ones start at 6, so 5
     * is the dividing line. This is the rule that does the real work.
     */
    maxWords: z.number().int().positive(),
    /**
     * An SEO safety net rather than a second style rule. H1 length does not
     * affect ranking, but Google may show the post title as the search title
     * (and DocStudio falls back to it when no meta title is set), and search
     * titles truncate at roughly 600px ≈ 60 characters.
     */
    maxChars: z.number().int().positive(),
    /** Lowercase; matched against the start of the title. */
    bannedPrefixes: z.array(z.string()),
  }),

  categories: z.object({
    /**
     * Explicit approved list. Ships EMPTY on purpose: DocStudio hosts several
     * products and a global taxonomy would be wrong for all but one of them.
     * When empty, a project's own existing sections act as its approved
     * categories — which is what the guideline actually asks for ("reuse
     * existing categories whenever possible"). Fill this in per project only
     * when Marketing hands over a canonical list to override that.
     */
    allowed: z.array(z.string()),
    /** Creating a category outside the approved set warns and asks for confirmation, never blocks. */
    warnOnNew: z.boolean(),
  }),

  images: z.object({
    /** MIME types accepted by the editor and the upload route. */
    allowedFormats: z.array(z.string()),
    width: z.number().int().positive(),
    /**
     * OPEN QUESTION — the guideline says "fixed 1150px canvas" (exact) but also
     * "crop or zoom when only a specific setting is relevant" (implies narrower).
     * "exact" rejects cropped screenshots; "max" allows them.
     */
    widthMode: z.enum(["exact", "max"]),
    /** Preferred ceiling — over this warns but passes. */
    targetKb: z.number().positive(),
    /** Hard ceiling for the upload validator. */
    maxKb: z.number().positive(),
    requireAlt: z.boolean(),
  }),

  metaTitle: z.object({
    min: z.number().int().nonnegative(),
    max: z.number().int().positive(),
    /**
     * Appended automatically at render time via smart tag, e.g. " – URM Docs".
     *
     * It always counts toward the band below, because Google measures the
     * string it displays — which includes the suffix. Making that configurable
     * only allowed the tool to be set up to give advice that guarantees
     * truncation: 60 characters of writer text plus an 11-character suffix
     * renders at 71.
     */
    suffix: z.string(),
    /** Lowercase; matched against the start of the meta title. */
    bannedFiller: z.array(z.string()),
  }),

  metaDescription: z.object({
    min: z.number().int().nonnegative(),
    max: z.number().int().positive(),
    /** Product name that should appear once, e.g. "URM". Empty disables the check. */
    brandMention: z.string(),
    /** Lowercase; at least one should open the description. */
    actionVerbs: z.array(z.string()),
  }),

  /**
   * Meta uniqueness. One concern rather than a flag per field: the guideline
   * requires both the title and the description to be unique, and the check
   * runs the same query for each.
   *
   * Deliberately no scope option. Each project's public docs site is its own
   * deployment on its own domain or subdomain, so two products never share a
   * site — identical titles on separate sites do not compete in search. An
   * "across every product" setting could only produce warnings about a website
   * the writer does not work on.
   */
  duplicates: z.object({
    warn: z.boolean(),
  }),
});

export type EditorialGuidelines = z.infer<typeof EditorialGuidelinesSchema>;

export const DEFAULT_GUIDELINES: EditorialGuidelines = {
  title: {
    maxWords: 5,
    maxChars: 60,
    bannedPrefixes: ["how to", "guide to", "overview of", "a guide to"],
  },

  categories: {
    // Empty by design — see the schema comment above.
    allowed: [],
    warnOnNew: true,
  },

  images: {
    allowedFormats: ["image/webp"],
    width: 1150,
    widthMode: "exact",
    targetKb: 50,
    maxKb: 100,
    requireAlt: true,
  },

  metaTitle: {
    min: 50,
    max: 60,
    suffix: "",
    bannedFiller: ["how to", "guide to", "overview"],
  },

  metaDescription: {
    min: 140,
    max: 160,
    brandMention: "",
    actionVerbs: [
      "configure",
      "enable",
      "restrict",
      "fix",
      "set up",
      "create",
      "manage",
      "add",
      "customize",
      "connect",
    ],
  },

  duplicates: {
    warn: true,
  },
};

/** Settings key in the `global_settings` table. */
export const GUIDELINES_SETTINGS_KEY = "editorial.guidelines";
export const GUIDELINES_SETTINGS_CATEGORY = "editorial";

/**
 * Merge a partial override over a base, one level into each top-level group.
 * A project override only needs to name the keys it changes — typically the
 * meta-title suffix and the category list, which are product-specific.
 */
export function mergeGuidelines(
  base: EditorialGuidelines,
  override: unknown,
): EditorialGuidelines {
  if (!override || typeof override !== "object") return base;
  const patch = override as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...base };

  for (const [key, value] of Object.entries(patch)) {
    if (!(key in base)) continue;
    const current = merged[key];
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      current &&
      typeof current === "object" &&
      !Array.isArray(current)
    ) {
      merged[key] = { ...current, ...value };
    } else if (value !== undefined && value !== null) {
      merged[key] = value;
    }
  }

  // Re-validate after merging so a malformed stored override can never reach
  // the lint rules or the AI prompts. Fall back to the base if it does.
  const parsed = EditorialGuidelinesSchema.safeParse(merged);
  return parsed.success ? parsed.data : base;
}
