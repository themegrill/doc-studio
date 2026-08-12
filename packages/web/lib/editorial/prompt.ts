/**
 * Renders the editorial guidelines into instruction text for Claude (DOCSTUDIO-45).
 *
 * This is the file that stops prompt/UI drift. Before it existed, the meta-title
 * rule was written down three times — in the SEO panel's counter, in the
 * generate-seo-title route's system prompt, and in the Jira guideline — and no
 * one of the three knew all of the rules. Now the numbers come from one object,
 * so changing a setting changes both what the writer sees and what the AI is told.
 */

import type { EditorialGuidelines } from "./guidelines";

export type PromptScope =
  | "title"
  | "description"
  | "metaTitle"
  | "metaDescription"
  | "review";

const list = (items: string[]) =>
  items.map((item) => `"${item}"`).join(", ");

const titleRules = (g: EditorialGuidelines) => [
  `Be at most ${g.title.maxWords} words and ${g.title.maxChars} characters.`,
  "Be task-oriented — name what the reader is trying to do, not how the feature is built.",
  `Never begin with filler such as ${list(g.title.bannedPrefixes)}. Write "Generate Purchase Invoice", not "How to Generate the Invoice for Your Purchase".`,
  "Prefer a phrase over a sentence. Remove unnecessary words.",
  "Let a reader understand the article topic within a few seconds.",
];

const metaTitleRules = (g: EditorialGuidelines) => {
  const rules = [
    `Use the FULL ${g.metaTitle.min}–${g.metaTitle.max} character range. Fewer than ${g.metaTitle.min} characters is a failure, not a concise answer — it wastes search space. Never exceed ${g.metaTitle.max}.`,
    "Start with the feature or task name.",
    "Use one primary keyword only.",
    `Avoid filler such as ${list(g.metaTitle.bannedFiller)} unless it genuinely matches the search intent.`,
    "Be unique — never reuse another page's meta title.",
    "Not include pipe separators.",
    "Not append a site name, product name or brand at the end — that is added separately.",
    "If the page is add-on specific, include the add-on name.",
  ];

  if (g.metaTitle.suffix) {
    rules.push(
      `Not include the site-name suffix "${g.metaTitle.suffix.trim()}" — it is appended automatically by a smart tag.`,
      `That ${g.metaTitle.suffix.length}-character suffix counts toward the band, so your own text must be ${Math.max(0, g.metaTitle.min - g.metaTitle.suffix.length)}–${Math.max(0, g.metaTitle.max - g.metaTitle.suffix.length)} characters.`,
    );
  } else {
    rules.push("Not include the site name.");
  }

  return rules;
};

const metaDescriptionRules = (g: EditorialGuidelines) => {
  const rules = [
    `Use the FULL ${g.metaDescription.min}–${g.metaDescription.max} character range. Fewer than ${g.metaDescription.min} characters is a failure, not a concise answer. Never exceed ${g.metaDescription.max}.`,
    "Describe what the page helps users accomplish.",
    "Include the primary keyword naturally, once.",
    `Use action-oriented language — open with a verb such as ${list(
      g.metaDescription.actionVerbs.slice(0, 6),
    )}.`,
    "Be unique — never reuse another page's meta description.",
    "Not start with the page title verbatim.",
    "Not stuff keywords.",
  ];

  if (g.metaDescription.brandMention) {
    rules.push(
      `Mention ${g.metaDescription.brandMention} exactly once, naturally.`,
    );
  }

  return rules;
};

const descriptionRules = () => [
  "Be one or two sentences.",
  "Summarise the outcome the reader gets, not the steps.",
  "Not repeat the title verbatim.",
  "Be professional and suitable for technical documentation.",
];

/**
 * Instruction text for a single-purpose AI call. Returns the rules that apply
 * to `scope` only — a meta-title generator does not need the image spec.
 */
export function renderGuidelinesPrompt(
  guidelines: EditorialGuidelines,
  scope: PromptScope,
): string {
  switch (scope) {
    case "title":
      return [
        "You are a technical documentation editor writing page titles.",
        "A good documentation title must:",
        ...titleRules(guidelines).map((rule) => `- ${rule}`),
        "",
        "Return ONLY the title text — no quotes, no explanation.",
      ].join("\n");

    case "description":
      return [
        "You are a technical documentation editor writing page descriptions.",
        "A good description must:",
        ...descriptionRules().map((rule) => `- ${rule}`),
        "",
        "Return ONLY the description text — no quotes, no explanation.",
      ].join("\n");

    case "metaTitle":
      return [
        "You are an SEO expert writing meta titles for documentation pages.",
        "A good meta title must:",
        ...metaTitleRules(guidelines).map((rule) => `- ${rule}`),
        "",
        "Return ONLY the title text — no quotes, no explanation.",
      ].join("\n");

    case "metaDescription":
      return [
        "You are an SEO expert writing meta descriptions for documentation pages.",
        "A good meta description must:",
        ...metaDescriptionRules(guidelines).map((rule) => `- ${rule}`),
        "",
        "Return ONLY the description text — no quotes, no explanation.",
      ].join("\n");

    case "review":
      // Deliberately excludes every character band, dimension and file-size
      // limit. Those are measured exactly by lib/editorial/rules.ts and shown
      // to the writer already. Handing them to the model made it re-check them
      // and get them wrong — it reported a 55-character meta title as "only 56
      // characters" and flagged it, when 55 sits inside the required 50–60.
      // Removing the numbers removes the temptation; the instruction alone was
      // not enough.
      return [
        "You are a documentation editor reviewing a page against the team's editorial guidelines.",
        "",
        "## Page titles",
        "- Be task-oriented — name what the reader is trying to do, not how the feature is built.",
        `- Never begin with filler such as ${list(guidelines.title.bannedPrefixes)}. Write "Generate Purchase Invoice", not "How to Generate the Invoice for Your Purchase".`,
        "- Prefer a phrase over a sentence, and let a reader grasp the topic within a few seconds.",
        "",
        "## Categories",
        "- Categories reflect how users search, not how our plugins are structured.",
        "- Group articles by user intent rather than by add-on or feature name.",
        "- A category may hold articles from several add-ons if they solve similar user problems.",
        guidelines.categories.allowed.length
          ? `- The approved categories are: ${list(guidelines.categories.allowed)}.`
          : "- Reuse an existing category wherever one fits.",
        "",
        "## Meta title",
        "- Lead with the feature or task name, using the page's real primary keyword.",
        `- Avoid filler such as ${list(guidelines.metaTitle.bannedFiller)} unless it genuinely matches the search intent.`,
        "- If the page is add-on specific, name the add-on.",
        "",
        "## Meta description",
        "- Say what the reader will accomplish, rather than restating the title.",
        `- Open with an action such as ${list(
          guidelines.metaDescription.actionVerbs.slice(0, 6),
        )}.`,
        "- Read naturally, with the primary keyword used once and no keyword stuffing.",
        "",
        "## Images and screenshots",
        "- Use a full-page screenshot only when the whole page provides useful context; crop or zoom when only one setting is relevant.",
        "- Each screenshot should make the relevant element immediately obvious.",
      ].join("\n");
  }
}

/**
 * The rules a deterministic check cannot decide. Used by the Editorial Review
 * route to keep the model on judgement calls rather than re-reporting the
 * character counts the editor already shows live.
 */
export const JUDGEMENT_ONLY_INSTRUCTION = [
  "The editor already checks lengths, formats, allowed categories, duplicate meta and missing alt text automatically, and reports them separately.",
  "Do NOT report those. Report only what a character count cannot decide:",
  "- Whether the title is genuinely task-oriented, or merely short.",
  "- Whether the category describes what the user is trying to achieve, rather than our plugin architecture.",
  "- Whether the meta description says what the reader accomplishes, rather than restating the title.",
  "- Whether the meta title leads with the real primary keyword for this page.",
  "NEVER state or estimate a character count, length, file size or pixel dimension — those are measured exactly elsewhere and your estimate will be wrong.",
  "Return at most 4 findings. If the page is in good shape, return none.",
].join("\n");
