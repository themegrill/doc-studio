/**
 * Editorial lint rules (DOCSTUDIO-45)
 *
 * Pure and synchronous: no React, no database, no fetch. The identical code
 * runs in the editor (for live hints) and on the server (for the AI review and
 * any future reporting), which is what keeps the two from drifting apart.
 *
 * Every finding is advisory. Per the approved plan nothing here ever blocks a
 * publish or a draft save, which is why there is no "error" severity.
 */

import type { EditorialGuidelines } from "./guidelines";

export type FindingSeverity = "warning" | "info";

export type FindingField =
  | "title"
  | "metaTitle"
  | "metaDescription"
  | "image"
  | "category";

export interface Finding {
  /** Stable identifier — used as a React key and to dismiss individual findings. */
  id: string;
  severity: FindingSeverity;
  field: FindingField;
  /** What is wrong, in one sentence, from the writer's side of the screen. */
  message: string;
  /** How to fix it, in prose. Quotes the guideline's own wording where there is one. */
  hint?: string;
  /**
   * Replacement text the writer can use as-is.
   *
   * Kept separate from `hint` because rendering a bare rewritten title under a
   * complaint reads as a non-sequitur — a writer seeing "Automate Event
   * Notifications" beneath "the title names a feature" has no way to know it is
   * a proposed replacement rather than a stray fragment.
   */
  suggestion?: string;
}

/**
 * Human label per field. Messages are deliberately short and field-relative
 * ("Not set — add one, 50–60 characters"), so any surface that shows a finding
 * without surrounding context must prefix it with this.
 */
export const FINDING_FIELD_LABEL: Record<FindingField, string> = {
  title: "Title",
  metaTitle: "Meta title",
  metaDescription: "Meta description",
  image: "Images",
  category: "Category",
};

/** Minimal structural view of a BlockNote block — we only read what we lint. */
export interface LintBlock {
  type?: string;
  props?: Record<string, unknown>;
  children?: LintBlock[];
}

export interface LintInput {
  title?: string;
  description?: string;
  seo?: {
    metaTitle?: string;
    metaDescription?: string;
  };
  blocks?: LintBlock[];
  /** The section/category this document sits under, by display title. */
  categoryTitle?: string;
  /**
   * Titles of other documents already using this meta title/description, if any.
   * Supplied by the server — uniqueness is the one rule that needs a lookup.
   */
  duplicates?: {
    metaTitle?: string | null;
    metaDescription?: string | null;
  };
}

const countWords = (value: string) =>
  value.trim().split(/\s+/).filter(Boolean).length;

const startsWithAny = (value: string, prefixes: string[]) =>
  prefixes.find((prefix) => value.trim().toLowerCase().startsWith(prefix));

/**
 * The writer's own title with the filler prefix removed.
 *
 * Quoting the guideline's canonical example ("Generate Purchase Invoice") next
 * to an unrelated title reads as though the tool has misunderstood the page —
 * a writer working on "How to test" does not need to hear about invoices.
 * Showing their own words back, minus the prefix, is immediately actionable.
 *
 * This is only the mechanical half of the fix; the guideline also wants the
 * title shortened and made task-oriented, which is what the AI button is for.
 * Returns null when nothing useful is left.
 */
export function suggestTitleWithoutPrefix(
  title: string,
  prefix: string,
): string | null {
  const trimmed = title.trim();
  if (!trimmed.toLowerCase().startsWith(prefix)) return null;

  const rest = trimmed
    .slice(prefix.length)
    // Drop any separator left behind, e.g. "How to: Configure" or "Guide to — X".
    .replace(/^[\s:\-–—,.]+/, "")
    .trim();

  if (rest.length < 2) return null;

  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

/** Walk nested blocks (columns, lists and quotes nest children). */
function flattenBlocks(blocks: LintBlock[] | undefined): LintBlock[] {
  if (!blocks?.length) return [];
  const out: LintBlock[] = [];
  const walk = (list: LintBlock[]) => {
    for (const block of list) {
      out.push(block);
      if (Array.isArray(block.children)) walk(block.children);
    }
  };
  walk(blocks);
  return out;
}

const fileExtension = (url: string) => {
  const withoutQuery = url.split(/[?#]/)[0];
  const dot = withoutQuery.lastIndexOf(".");
  return dot === -1 ? "" : withoutQuery.slice(dot + 1).toLowerCase();
};

/**
 * The length the meta title is judged on: the writer's text plus the site-name
 * suffix that gets appended at render time.
 *
 * The suffix is included because Google measures what it displays. Judging the
 * writer's text alone would pass a title at 60 characters that actually renders
 * at 71 and gets cut off.
 */
export function countedMetaTitle(
  metaTitle: string,
  guidelines: EditorialGuidelines,
): string {
  return `${metaTitle}${guidelines.metaTitle.suffix}`;
}

export function lintDocument(
  input: LintInput,
  guidelines: EditorialGuidelines,
): Finding[] {
  const findings: Finding[] = [];

  // ---------------------------------------------------------------- titles

  const title = (input.title ?? "").trim();

  if (title) {
    const words = countWords(title);
    if (words > guidelines.title.maxWords) {
      findings.push({
        id: "title-too-long",
        severity: "warning",
        field: "title",
        message: `${words} words — aim for ${guidelines.title.maxWords} or fewer.`,
      });
    } else if (title.length > guidelines.title.maxChars) {
      findings.push({
        id: "title-too-long",
        severity: "warning",
        field: "title",
        message: `${title.length} characters — aim for ${guidelines.title.maxChars} or fewer.`,
      });
    }

    const bannedPrefix = startsWithAny(title, guidelines.title.bannedPrefixes);
    if (bannedPrefix) {
      const suggestion = suggestTitleWithoutPrefix(title, bannedPrefix);
      findings.push({
        id: "title-filler-prefix",
        severity: "warning",
        field: "title",
        // The fix goes in the message itself, so there is one short line to
        // read rather than a message plus an explanatory second line.
        message: suggestion
          ? `Starts with "${bannedPrefix}" — try "${suggestion}".`
          : `Starts with "${bannedPrefix}" — lead with a verb, e.g. "Configure Login Form".`,
      });
    }
  }

  // ------------------------------------------------------------- meta title

  const metaTitle = (input.seo?.metaTitle ?? "").trim();

  if (!metaTitle) {
    findings.push({
      id: "meta-title-missing",
      severity: "warning",
      field: "metaTitle",
      message: `Not set — add one, ${guidelines.metaTitle.min}–${guidelines.metaTitle.max} characters.`,
    });
  } else {
    const counted = countedMetaTitle(metaTitle, guidelines).length;
    const band = `${guidelines.metaTitle.min}–${guidelines.metaTitle.max}`;

    if (counted > guidelines.metaTitle.max) {
      findings.push({
        id: "meta-title-too-long",
        severity: "warning",
        field: "metaTitle",
        message: `${counted} characters — max ${guidelines.metaTitle.max}, or Google truncates it.`,
      });
    } else if (counted < guidelines.metaTitle.min) {
      findings.push({
        id: "meta-title-too-short",
        severity: "warning",
        field: "metaTitle",
        message: `${counted} characters — needs ${band}.`,
      });
    }

    const filler = startsWithAny(metaTitle, guidelines.metaTitle.bannedFiller);
    if (filler) {
      const suggestion = suggestTitleWithoutPrefix(metaTitle, filler);
      findings.push({
        id: "meta-title-filler",
        severity: "warning",
        field: "metaTitle",
        message: suggestion
          ? `Starts with "${filler}" — try "${suggestion}".`
          : `Starts with "${filler}" — lead with the feature name.`,
      });
    }

    if (
      guidelines.metaTitle.suffix &&
      metaTitle
        .toLowerCase()
        .includes(guidelines.metaTitle.suffix.trim().toLowerCase())
    ) {
      findings.push({
        id: "meta-title-suffix-duplicated",
        severity: "info",
        field: "metaTitle",
        message: `Remove "${guidelines.metaTitle.suffix.trim()}" — it is added automatically.`,
      });
    }

    if (guidelines.duplicates.warn && input.duplicates?.metaTitle) {
      findings.push({
        id: "meta-title-duplicate",
        severity: "warning",
        field: "metaTitle",
        message: `Already used by "${input.duplicates.metaTitle}" — must be unique.`,
      });
    }
  }

  // ------------------------------------------------------- meta description

  const metaDescription = (input.seo?.metaDescription ?? "").trim();

  if (!metaDescription) {
    findings.push({
      id: "meta-description-missing",
      severity: "warning",
      field: "metaDescription",
      message: `Not set — add one, ${guidelines.metaDescription.min}–${guidelines.metaDescription.max} characters.`,
    });
  } else {
    const length = metaDescription.length;
    const band = `${guidelines.metaDescription.min}–${guidelines.metaDescription.max}`;

    if (length > guidelines.metaDescription.max) {
      findings.push({
        id: "meta-description-too-long",
        severity: "warning",
        field: "metaDescription",
        message: `${length} characters — max ${guidelines.metaDescription.max}, or Google truncates it.`,
      });
    } else if (length < guidelines.metaDescription.min) {
      findings.push({
        id: "meta-description-too-short",
        severity: "warning",
        field: "metaDescription",
        message: `${length} characters — needs ${band}.`,
      });
    }

    const opensWithAction = guidelines.metaDescription.actionVerbs.some((verb) =>
      metaDescription.toLowerCase().startsWith(verb),
    );
    if (guidelines.metaDescription.actionVerbs.length && !opensWithAction) {
      findings.push({
        id: "meta-description-not-action-oriented",
        severity: "info",
        field: "metaDescription",
        message: `Open with an action — ${guidelines.metaDescription.actionVerbs
          .slice(0, 4)
          .map((verb) => verb[0].toUpperCase() + verb.slice(1))
          .join(", ")}\u2026`,
      });
    }

    const brand = guidelines.metaDescription.brandMention.trim();
    if (brand) {
      const occurrences = metaDescription
        .toLowerCase()
        .split(brand.toLowerCase()).length - 1;
      if (occurrences === 0) {
        findings.push({
          id: "meta-description-missing-brand",
          severity: "info",
          field: "metaDescription",
          message: `Mention ${brand} once.`,
        });
      } else if (occurrences > 1) {
        findings.push({
          id: "meta-description-brand-repeated",
          severity: "info",
          field: "metaDescription",
          message: `Mentions ${brand} ${occurrences} times — once is enough.`,
        });
      }
    }

    if (
      guidelines.duplicates.warn &&
      input.duplicates?.metaDescription
    ) {
      findings.push({
        id: "meta-description-duplicate",
        severity: "warning",
        field: "metaDescription",
        message: `Already used by "${input.duplicates.metaDescription}" — must be unique.`,
      });
    }
  }

  // ------------------------------------------------------------------ images

  // A freshly inserted image block has url: "" until a file is chosen. Counting
  // those as "missing alt text" flags the writer for a placeholder they have not
  // filled in yet, so an actual URL is required.
  const imageBlocks = flattenBlocks(input.blocks).filter(
    (block) =>
      block.type === "image" &&
      typeof block.props?.url === "string" &&
      block.props.url.trim().length > 0,
  );

  const missingAlt = imageBlocks.filter(
    (block) => !String(block.props?.alt ?? "").trim(),
  ).length;

  if (guidelines.images.requireAlt && missingAlt > 0) {
    findings.push({
      id: "image-missing-alt",
      severity: "warning",
      field: "image",
      message:
        missingAlt === 1
          ? "1 image has no alt text."
          : `${missingAlt} images have no alt text.`,
    });
  }

  const allowedExtensions = guidelines.images.allowedFormats
    .map((mime) => mime.split("/")[1])
    .filter(Boolean);

  const wrongFormat = imageBlocks.filter((block) => {
    const url = String(block.props?.url ?? "");
    if (url.startsWith("data:")) return false;
    const ext = fileExtension(url);
    // No extension means an external or proxied URL we cannot judge from here.
    return ext !== "" && !allowedExtensions.includes(ext);
  }).length;

  if (wrongFormat > 0 && allowedExtensions.length) {
    findings.push({
      id: "image-wrong-format",
      severity: "warning",
      field: "image",
      message:
        wrongFormat === 1
          ? `1 image is not ${allowedExtensions.join(" or ").toUpperCase()}.`
          : `${wrongFormat} images are not ${allowedExtensions.join(" or ").toUpperCase()}.`,
      // The only hint kept: re-exporting needs the exact specs, and they are
      // not otherwise visible from the editor.
      hint: `Re-export at ${guidelines.images.width}px, under ${guidelines.images.maxKb}KB.`,
    });
  }

  // -------------------------------------------------------------- category

  const category = (input.categoryTitle ?? "").trim();
  if (
    category &&
    guidelines.categories.warnOnNew &&
    guidelines.categories.allowed.length &&
    !guidelines.categories.allowed.some(
      (allowed) => allowed.toLowerCase() === category.toLowerCase(),
    )
  ) {
    findings.push({
      id: "category-not-approved",
      severity: "warning",
      field: "category",
      message: `"${category}" is a new category — needs Marketing sign-off.`,
    });
  }

  return findings;
}

/** Convenience for badge counts — info-level findings are advisory noise, not warnings. */
export const countWarnings = (findings: Finding[]) =>
  findings.filter((finding) => finding.severity === "warning").length;
