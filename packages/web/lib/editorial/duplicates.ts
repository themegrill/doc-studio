/**
 * Meta title/description uniqueness (DOCSTUDIO-45, guideline §4). Server-only.
 *
 * This is the one editorial rule a human genuinely cannot verify while writing —
 * it requires searching every other article. Supported by the expression indexes
 * added in db/13-editorial-guidelines.sql.
 */

import { getDb } from "@/lib/db/postgres";
import { stripTitleHTML } from "@/lib/parse-title-badges";

export interface DuplicateMatches {
  /** Title of an existing document already using this meta title, if any. */
  metaTitle: string | null;
  /** Title of an existing document already using this meta description, if any. */
  metaDescription: string | null;
}

export interface FindDuplicatesArgs {
  projectId: string;
  /** Slug of the document being edited, so it never collides with itself. */
  slug: string;
  metaTitle?: string | null;
  metaDescription?: string | null;
}

export async function findMetaDuplicates({
  projectId,
  slug,
  metaTitle,
  metaDescription,
}: FindDuplicatesArgs): Promise<DuplicateMatches> {
  const matches: DuplicateMatches = { metaTitle: null, metaDescription: null };

  const trimmedTitle = metaTitle?.trim();
  const trimmedDescription = metaDescription?.trim();
  if (!trimmedTitle && !trimmedDescription) return matches;

  const sql = getDb();

  // Titles can carry embedded badge markup (see lib/parse-title-badges.ts), so
  // the colliding document's title must be cleaned before it reaches the
  // writer — otherwise the warning reads
  // `already used by "Managing Users <span class="premium-feature">Pro</span>"`.
  const cleanTitle = (value: unknown) =>
    typeof value === "string" ? stripTitleHTML(value) : null;

  try {
    if (trimmedTitle) {
      const [row] = await sql`
        SELECT title
        FROM documents
        WHERE deleted_at IS NULL
          AND seo->>'metaTitle' = ${trimmedTitle}
          AND project_id = ${projectId}
          AND slug != ${slug}
        LIMIT 1
      `;
      matches.metaTitle = cleanTitle(row?.title);
    }

    if (trimmedDescription) {
      const [row] = await sql`
        SELECT title
        FROM documents
        WHERE deleted_at IS NULL
          AND seo->>'metaDescription' = ${trimmedDescription}
          AND project_id = ${projectId}
          AND slug != ${slug}
        LIMIT 1
      `;
      matches.metaDescription = cleanTitle(row?.title);
    }
  } catch (error) {
    // Uniqueness is advisory — a failed lookup must never break the editor.
    console.error("[editorial] Duplicate meta lookup failed:", error);
  }

  return matches;
}
