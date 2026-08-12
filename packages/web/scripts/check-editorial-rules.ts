#!/usr/bin/env tsx
/**
 * Checks for the editorial ruleset (DOCSTUDIO-45).
 *
 *   pnpm check:editorial
 *
 * The rules in lib/editorial are the heart of the feature — the same code runs
 * in the editor, on the server and behind the AI prompts — so a silent
 * regression here is invisible until a writer hits it. No test runner is
 * configured in this repo, so these are plain assertions run through tsx, in
 * keeping with the other scripts/ utilities. Needs no database and no API key.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { lintDocument, type LintInput } from "../lib/editorial/rules";
import {
  DEFAULT_GUIDELINES,
  mergeGuidelines,
} from "../lib/editorial/guidelines";
import { renderGuidelinesPrompt } from "../lib/editorial/prompt";
import { readImageInfo } from "../lib/editorial/image-dimensions";
import { checkImage } from "../lib/editorial/image-check";
import { applyTitleSuffix } from "../lib/seo/doc-metadata";

let failed = 0;
let passed = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? passed++ : failed++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}`);
  if (!ok) {
    console.log(`          actual   ${JSON.stringify(actual)}`);
    console.log(`          expected ${JSON.stringify(expected)}`);
  }
}

/** Sound meta values, so a test about titles is not polluted by SEO findings. */
const OK_SEO = {
  metaTitle: "x".repeat(55),
  metaDescription: "Configure " + "y".repeat(140),
};

const ids = (input: LintInput, g = DEFAULT_GUIDELINES) =>
  lintDocument(input, g)
    .map((f) => f.id)
    .sort();

// ─── titles ───────────────────────────────────────────────────────────────────
console.log("\ntitles");

check(
  "the guideline's own bad example is flagged",
  ids({ title: "How to Generate the Invoice for Your Purchase", seo: OK_SEO }),
  ["title-filler-prefix", "title-too-long"],
);
check(
  "the guideline's own preferred example is clean",
  ids({ title: "Generate Purchase Invoice", seo: OK_SEO }),
  [],
);
check(
  "the suggestion is built from the writer's own title",
  lintDocument({ title: "How to test", seo: OK_SEO }, DEFAULT_GUIDELINES).find(
    (f) => f.id === "title-filler-prefix",
  )?.message,
  'Starts with "how to" — try "Test".',
);
check(
  "with nothing left to strip it falls back to an example",
  lintDocument({ title: "How to", seo: OK_SEO }, DEFAULT_GUIDELINES).find(
    (f) => f.id === "title-filler-prefix",
  )?.message,
  'Starts with "how to" — lead with a verb, e.g. "Configure Login Form".',
);

// The word limit must catch every avoided example on length alone, so the rule
// does not depend on the filler-prefix check as its only line of defence. At the
// previous default of 6 words, "How to Configure the Login Form" slipped past.
for (const avoided of [
  "How to Generate the Invoice for Your Purchase",
  "How to Use Buy Now Button Block",
  "How to Configure the Login Form",
]) {
  check(
    `length alone flags: ${avoided}`,
    ids({ title: avoided, seo: OK_SEO }).includes("title-too-long"),
    true,
  );
}

// ...and every preferred example must still pass untouched.
for (const preferred of [
  "Generate Purchase Invoice",
  "Using Buy Now Button",
  "Configure Login Form",
]) {
  check(`stays clean: ${preferred}`, ids({ title: preferred, seo: OK_SEO }), []);
}

// ─── meta ─────────────────────────────────────────────────────────────────────
console.log("\nmeta title and description");

check("empty meta raises both warnings", ids({ title: "Generate Purchase Invoice" }), [
  "meta-description-missing",
  "meta-title-missing",
]);
check(
  "under the floor is flagged, not just over the ceiling",
  ids({ title: "Generate Purchase Invoice", seo: { ...OK_SEO, metaTitle: "Login Form" } }),
  ["meta-title-too-short"],
);
check(
  "the uniqueness switch off suppresses the warning",
  ids(
    { title: "Generate Purchase Invoice", seo: OK_SEO, duplicates: { metaTitle: "Managing Users" } },
    mergeGuidelines(DEFAULT_GUIDELINES, { duplicates: { warn: false } }),
  ),
  [],
);
check(
  "one switch governs both fields",
  ids(
    {
      title: "Generate Purchase Invoice",
      seo: OK_SEO,
      duplicates: { metaTitle: "A", metaDescription: "B" },
    },
    DEFAULT_GUIDELINES,
  ),
  ["meta-description-duplicate", "meta-title-duplicate"],
);
check(
  "a duplicate names the colliding article",
  lintDocument(
    { title: "Generate Purchase Invoice", seo: OK_SEO, duplicates: { metaTitle: "Managing Users" } },
    DEFAULT_GUIDELINES,
  ).find((f) => f.id === "meta-title-duplicate")?.message,
  'Already used by "Managing Users" — must be unique.',
);

// The suffix always counts, because Google measures the string it displays.
// " – URM Docs" is 11 characters, so a project with that suffix leaves the
// writer 39–49 characters of their own text against a 50–60 band.
const withSuffix = mergeGuidelines(DEFAULT_GUIDELINES, {
  metaTitle: { ...DEFAULT_GUIDELINES.metaTitle, suffix: " – URM Docs" },
});
check(
  "55 chars of writer text renders at 66 and breaches the ceiling",
  ids({ title: "Generate Purchase Invoice", seo: OK_SEO }, withSuffix),
  ["meta-title-too-long"],
);
check(
  "44 chars of writer text renders at 55 and sits in the band",
  ids(
    { title: "Generate Purchase Invoice", seo: { ...OK_SEO, metaTitle: "x".repeat(44) } },
    withSuffix,
  ),
  [],
);
check(
  "with no suffix configured the writer's text is judged as-is",
  ids({ title: "Generate Purchase Invoice", seo: OK_SEO }),
  [],
);
check(
  "typing the suffix by hand is caught",
  ids(
    {
      title: "Generate Purchase Invoice",
      seo: { ...OK_SEO, metaTitle: "Configure Stripe Payments Fast – URM Docs" },
    },
    withSuffix,
  ),
  ["meta-title-suffix-duplicated"],
);

// ─── categories ───────────────────────────────────────────────────────────────
console.log("\ncategories");

check(
  "empty default → nothing inherited across products",
  ids({ title: "Generate Purchase Invoice", seo: OK_SEO, categoryTitle: "Anything At All" }),
  [],
);
const withCategories = mergeGuidelines(DEFAULT_GUIDELINES, {
  categories: { allowed: ["Payment & Billing", "Content Restriction"], warnOnNew: true },
});
check(
  "configured list → an unapproved category is flagged",
  ids({ title: "Generate Purchase Invoice", seo: OK_SEO, categoryTitle: "Buy Now Button" }, withCategories),
  ["category-not-approved"],
);
check(
  "matching is case-insensitive",
  ids({ title: "Generate Purchase Invoice", seo: OK_SEO, categoryTitle: "payment & billing" }, withCategories),
  [],
);

// ─── images ───────────────────────────────────────────────────────────────────
console.log("\nimages");

check(
  "an empty placeholder block is not flagged",
  ids({ title: "Generate Purchase Invoice", seo: OK_SEO, blocks: [{ type: "image", props: { url: "", alt: "" } }] }),
  [],
);
check(
  "a real image with no alt IS flagged",
  ids({ title: "Generate Purchase Invoice", seo: OK_SEO, blocks: [{ type: "image", props: { url: "/a.webp", alt: "" } }] }),
  ["image-missing-alt"],
);
check(
  "nested images are counted",
  ids({
    title: "Generate Purchase Invoice",
    seo: OK_SEO,
    blocks: [{ type: "paragraph", children: [{ type: "image", props: { url: "/b.webp", alt: "" } }] }],
  }),
  ["image-missing-alt"],
);

const logo = readFileSync(join(process.cwd(), "public", "doc-studio-final-logo.png"));
check("PNG header is read correctly", readImageInfo(new Uint8Array(logo)), {
  format: "png",
  width: 350,
  height: 80,
});
const rejected = checkImage(new Uint8Array(logo), logo.length, DEFAULT_GUIDELINES);
check("a non-compliant PNG is refused", rejected.ok, false);
check("every failing rule is reported at once", rejected.failures.length, 2);

// A synthetic JPEG declaring 1150x600, to cover the marker walk.
check(
  "JPEG SOF marker is found",
  readImageInfo(
    new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11,
      0x08, 0x02, 0x58, 0x04, 0x7e, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01,
      0x03, 0x11, 0x01,
    ]),
  ),
  { format: "jpeg", width: 1150, height: 600 },
);

// ─── title suffix ─────────────────────────────────────────────────────────────
console.log("\nsite-name suffix");

check("appends the suffix", applyTitleSuffix("Configure Login Form", " – URM Docs"), "Configure Login Form – URM Docs");
check("no suffix configured leaves the title alone", applyTitleSuffix("Configure Login Form", ""), "Configure Login Form");
check(
  "never doubled when the writer typed it",
  applyTitleSuffix("Configure Login Form – URM Docs", " – URM Docs"),
  "Configure Login Form – URM Docs",
);

// ─── prompts ──────────────────────────────────────────────────────────────────
console.log("\nprompts");

const review = renderGuidelinesPrompt(DEFAULT_GUIDELINES, "review");
check(
  "the review prompt carries no character bands",
  /\d+–\d+ character|\d+ characters/.test(review),
  false,
);
check("the review prompt still carries the qualitative rules", review.includes("task-oriented"), true);
check(
  "the meta-title prompt does state its band",
  renderGuidelinesPrompt(DEFAULT_GUIDELINES, "metaTitle").includes("50–60"),
  true,
);

// ─── config merging ───────────────────────────────────────────────────────────
console.log("\nconfig merging");

check("a malformed override falls back to the base", mergeGuidelines(DEFAULT_GUIDELINES, { metaTitle: { min: "fifty" } }), DEFAULT_GUIDELINES);
check("a partial override keeps its siblings", mergeGuidelines(DEFAULT_GUIDELINES, { metaTitle: { suffix: " – X" } }).metaTitle.max, 60);

console.log(
  `\n${failed === 0 ? "ALL PASSED" : `${failed} FAILED`}  (${passed}/${passed + failed})\n`,
);
process.exit(failed === 0 ? 0 : 1);
