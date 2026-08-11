/**
 * Assembles the system prompt for the one-shot AI routes (DOCSTUDIO-45). Server-only.
 *
 * Every "Write with AI" button now composes its instructions from the same two
 * sources: the checkable rules rendered out of the settings object, and the
 * house style guide markdown. Before this, each route carried its own
 * hand-written copy — which is how the meta-title rule ended up written down in
 * three places that disagreed with each other.
 */

import { getGuidelines } from "./config";
import { guidelineExcerpt, loadGuidelineMarkdown } from "./guideline-doc";
import { renderGuidelinesPrompt, type PromptScope } from "./prompt";
import type { EditorialGuidelines } from "./guidelines";

export interface GuidelinePrompt {
  /** The effective ruleset, so callers can use its numbers for post-processing. */
  guidelines: EditorialGuidelines;
  /** Ready to pass as `system:`. */
  system: string;
}

export async function buildGuidelinePrompt(
  scope: PromptScope,
  projectSlug?: string | null,
  /** House-style excerpt budget. Kept small for single-line generations. */
  styleGuideChars = 1500,
): Promise<GuidelinePrompt> {
  const guidelines = await getGuidelines(projectSlug);
  const rules = renderGuidelinesPrompt(guidelines, scope);

  const excerpt = guidelineExcerpt(
    loadGuidelineMarkdown(projectSlug).effective,
    styleGuideChars,
  );

  const system = excerpt
    ? `${rules}\n\n---\n\nHouse style guide (for tone and vocabulary):\n\n${excerpt}`
    : rules;

  return { guidelines, system };
}

export interface BandAttempt {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export interface BandResult extends BandAttempt {
  retried: boolean;
}

/**
 * Generate, and if the result falls short of the minimum, ask once more to
 * expand it.
 *
 * The model honours the ceiling reliably but treats the floor as optional:
 * measured against claude-sonnet-4-5, a 50–60 band produced 39 characters and a
 * 140–160 band produced 131. That meant "Write with AI" handed the writer text
 * the editor immediately flagged as too short — the tool arguing with itself.
 *
 * Costs a second call only when the first one misses, and keeps the first answer
 * if the retry does not actually improve on it.
 */
export async function generateWithinBand(
  attempt: (nudge: string | null) => Promise<BandAttempt>,
  normalise: (raw: string) => string,
  min: number,
  max: number,
): Promise<BandResult> {
  const first = await attempt(null);
  const firstText = normalise(first.text);

  if (firstText.length >= min) {
    return { ...first, text: firstText, retried: false };
  }

  const second = await attempt(
    `Your previous answer was "${firstText}" — only ${firstText.length} characters, short of the required ${min}–${max}. Rewrite it to at least ${min} characters by adding genuinely useful specifics, not padding or repetition, and stay under ${max}.`,
  );
  const secondText = normalise(second.text);

  const improved = secondText.length >= min || secondText.length > firstText.length;

  return {
    text: improved ? secondText : firstText,
    inputTokens: first.inputTokens + second.inputTokens,
    outputTokens: first.outputTokens + second.outputTokens,
    retried: true,
  };
}
