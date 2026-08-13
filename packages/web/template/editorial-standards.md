# Editorial Standards

These are org-wide rules. Unlike the house style guide, a project cannot replace
them — the editor checks them while writing and the AI is held to them on every
generation, for every product. They are always supplied in addition to whatever
writing guideline a project defines.

The exact numbers (title length, character bands, image dimensions, the
approved-category list) come from the Documentation Guidelines settings screen
rather than this file, so they can be changed without a deployment. The prose
below explains the intent behind them.

## 1. Post Titles

Titles must be short, clear, and task-oriented. A reader should understand the
article topic within a few seconds of reading the title.

- Keep titles concise; prefer a phrase over a sentence.
- Focus on the user's goal or task, not on how the feature is built.
- Remove unnecessary words.
- Never open with filler such as "How to", "Guide to", or "Overview of".

| Avoid | Preferred |
| --- | --- |
| How to Generate the Invoice for Your Purchase | Generate Purchase Invoice |
| How to Use Buy Now Button Block | Using Buy Now Button |
| How to Configure the Login Form | Configure Login Form |

## 2. Documentation Categories

Categories reflect how users search, not how our plugins are structured.

- Reuse an existing category wherever one fits.
- Group articles by user intent rather than by add-on or feature name.
- A category may hold articles from several add-ons if they solve similar user problems.
- Keep category names short and meaningful.
- New categories need Marketing sign-off — do not invent one to fit a single add-on.

Good: Payment & Billing · Content Restriction · User Access & Redirects · Form Behavior
Avoid: "Registration Forms and Form Types", or a category created solely for one
add-on when an existing category already fits.

## 3. SEO Meta Title and Description

Every page must have its own unique meta title and meta description. Do not skip
these — the page title and description are rarely the right length or shape for
search results.

**Meta title**

- 50–60 characters.
- Start with the feature or task name.
- One primary keyword only. Every title unique.
- Avoid filler such as "How To", "Guide To" or "Overview" unless it matches the
  search intent.
- Include the add-on name when the page is add-on specific.
- Do not type the site-name suffix — it is appended automatically by a smart tag.

**Meta description**

- 140–160 characters.
- Describe what the page helps the user accomplish.
- Open with an action: Configure, Enable, Restrict, Fix, Set up.
- Include the primary keyword naturally, once. Never stuff keywords.
- Mention the product name once. Every description unique.

## 4. Screenshots

Images are checked on upload and a non-compliant file is refused, so compose them
correctly before uploading.

- Format: WebP. Fixed width 1150px, flexible height. Under 50KB preferred, 100KB maximum.
- Compose on a 1150px canvas in Canva or Photoshop and fit the screenshot into it.
- Use a full-page screenshot only when the whole page provides useful context.
- Crop or zoom when only one setting or section is relevant.
- Remove unnecessary UI elements and whitespace.
- Give every image alt text.

**Annotations** — use them only when they draw attention to a specific element or
action, and keep the style identical across every document: the same colours,
arrow styles, shapes, line widths and text formatting. Documentation should read
as if a single author produced it.

## 5. Authorship

Write from your own company account, never a shared or global one, so every
document is attributable to the person who created or last updated it.

---

# Pre-Publish Checklist

Before publishing, verify:

- Title is task-oriented and free of "How to" / "Guide to" filler
- Category is an approved one that matches user intent
- Meta title is unique and within the configured character band
- Meta description is unique, within its band, and action-oriented
- No keyword stuffing, and the meta fields match the page content
- Add-on name is included where applicable
- Every screenshot is WebP, at the configured width, under the size cap, with alt text
- Annotation style matches the rest of the documentation
