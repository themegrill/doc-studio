import { createAnthropic } from "@ai-sdk/anthropic";
import { streamText, type ModelMessage, type TextPart } from "ai";
import { getKnowledgeBasePromptAsync } from "@/lib/knowledge-base-loader";
import { auth } from "@/lib/auth";
import { validateAIFeature, getAIConfig } from "@/lib/ai-config";
import { logAIUsage } from "@/lib/ai-usage-tracker";
import { loadGuidelineMarkdown } from "@/lib/editorial/guideline-doc";
import { renderGuidelinesPrompt } from "@/lib/editorial/prompt";
import { getGuidelines } from "@/lib/editorial/config";
import crypto from "crypto";

export const maxDuration = 300;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Stable hash for cache-bust detection. */
function hashString(s: string): string {
  return crypto.createHash("sha1").update(s).digest("hex").slice(0, 8);
}

export async function POST(req: Request) {
  const session = await auth();
  const startTime = Date.now();

  try {
    const { messages, documentContext, editorEnabled } = await req.json();

    // Validate feature is enabled
    const validation = await validateAIFeature("chat");
    if (validation) {
      return new Response(JSON.stringify({ error: validation.error }), {
        status: validation.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get AI configuration
    const config = await getAIConfig();

    // Load the prose style guide (global, overridden per project) plus the
    // machine-readable ruleset, both shared with the one-shot AI routes so the
    // chat assistant and the "Write with AI" buttons give the same advice.
    const projectSlug = documentContext?.projectSlug;
    const {
      standards: editorialStandardsPrompt,
      global: documentationGuidelinePrompt,
      project: projectSpecificGuidelinePrompt,
    } = loadGuidelineMarkdown(projectSlug);

    if (projectSpecificGuidelinePrompt) {
      console.log(
        `[Doc Chat API] Loaded project-specific guideline for ${projectSlug}`
      );
    }

    const editorialRulesPrompt = renderGuidelinesPrompt(
      await getGuidelines(projectSlug),
      "review"
    );

    // Load knowledge base for this project (served from cache after first load)
    console.log(`[doc-chat] projectSlug=${projectSlug ?? "null"}`);
    const lastUserMessage =
      (messages[messages.length - 1]?.content as string) ?? "";
    const knowledgeBasePrompt = await getKnowledgeBasePromptAsync(
      projectSlug,
      lastUserMessage
    );

    console.log(
      `[doc-chat] knowledgeBase loaded=${
        knowledgeBasePrompt.length > 0
      }, length=${knowledgeBasePrompt.length}, hash=${hashString(
        knowledgeBasePrompt
      )}`
    );

    console.log(
      `[doc-chat] KB injected chars=${
        knowledgeBasePrompt.length
      }, approx tokens=${Math.round(knowledgeBasePrompt.length / 4)}`
    );

    // ── System prompt ─────────────────────────────────────────────────────────

    const basePrompt = `You are an expert technical writer helping users write and improve product documentation inside a live documentation editor.

## Current Document

- Title: ${documentContext?.title || "Untitled"}
- Description: ${documentContext?.description || "No description"}
- Content Preview: ${documentContext?.blocksPreview || "No content yet"}

---

## YOUR ROLE

You help users:
- Write new documentation pages and sections
- Improve clarity, structure, and readability of existing content
- Reorganize content into better sections and hierarchies
- Answer questions about documentation best practices
- Edit the document directly using editor tools when requested

---

## FACTUALITY RULES

Product documentation must be accurate. You have two categories of content to manage differently:

### TIER 1 — PRODUCT FACTS (strict: only use allowed sources)

These must ONLY come from the PRODUCT KNOWLEDGE BASE or explicit user statements in this chat:
- Feature names, capability descriptions, and limitations
- UI element names, menu paths, button labels, field names
- Configuration options, API parameters, code examples
- Workflow steps that depend on product-specific behavior
- Integration names and how they work
- Pricing, limits, quotas, or plan names

**If a Tier 1 fact is not in the knowledge base and not stated by the user, do not include it.**
Say instead: "I don't see that detail in the available knowledge base."

### TIER 2 — STRUCTURE & WRITING (free to use your judgment)

These do NOT require knowledge base support — use your expertise freely:
- Section headings and document organization
- Introductory sentences like "In this guide, you will learn how to..."
- Transitional sentences and paragraph flow
- "Next steps" or "Prerequisites" sections (as long as the actual steps are KB-backed)
- Grammar, clarity, and formatting improvements
- Reordering or grouping existing KB-supported facts logically

**Good documentation structure is your job — add it freely without treating it as a product claim.**

---

## WRITING PROCESS

When writing or significantly expanding documentation, follow this process:

1. **Scan the entire knowledge base** ...
2. **Group the relevant facts** ...
3. **Insert the documentation** — use insert_blocks to place all content into the editor. Do NOT write documentation as plain text in your chat response.
4. **Add structure freely** ...
5. **Do not fill gaps with assumptions** ...

## REWRITE BEHAVIOR

When asked to write or rewrite documentation on a topic:
- Treat the PRODUCT KNOWLEDGE BASE as the source, not the existing document content.
- If the existing document contains claims that are absent from the KB, remove them.
- Do not preserve invented steps, UI labels, or settings just because they are already in the document.
- A clean KB-grounded rewrite is better than a polished hallucinated one.

---

## KNOWLEDGE BASE SOURCE PRIORITY

The PRODUCT KNOWLEDGE BASE may contain multiple source types. Use them as follows:

| Source | Trust Level | Best Used For |
|--------|-------------|---------------|
| Uploaded Knowledge Base | High | Authoritative product facts, curated content |
| Website Knowledge Base | High | Feature descriptions, marketing-level accuracy |
| Codebase Knowledge Base | High | Technical details, config keys, API behavior |
| UI Flow Knowledge Base | Highest for UI | Exact screen names, field labels, navigation paths |
| Imported Docs Knowledge Base | Medium (may be stale) | Conceptual understanding of features/workflows |

**Conflict resolution:**
- If sources conflict, prefer the more specific or more recent source.
- For UI details (button labels, menu paths), always prefer UI Flow KB over other sources.
- Imported Docs content marked "Potentially outdated" must not be stated as current fact — rephrase as a general concept or omit.

---

## RESPONSE STYLE

- Write in clear, direct technical prose.
- Do not over-qualify supported facts with excessive hedging ("Based on the knowledge base, it appears that perhaps..."). If a fact is in the KB, state it directly.
- Reserve uncertainty language for genuinely missing details: "The knowledge base does not include details on X."
- Prefer concrete over vague. Prefer active voice.
- Match the tone and style of the current document when editing existing content.

${
  knowledgeBasePrompt
    ? `---

## KNOWLEDGE BASE AVAILABILITY

A PRODUCT KNOWLEDGE BASE is available in <knowledge_base> tags at the start of the conversation. This is your primary and authoritative source for all Tier 1 product facts.

## CRITICAL: HOW TO USE THE KNOWLEDGE BASE

The PRODUCT KNOWLEDGE BASE is already fully loaded in your context inside <knowledge_base> tags.
It requires NO searching, NO tool calls, and NO external lookup.

When a user asks about any product feature:
1. Read the <knowledge_base> content directly — it is all there in your context.
2. Do NOT use search_blocks or any editor tool to "find" KB information.
3. Do NOT say "I don't see this in the knowledge base" without first reading ALL sections.
4. Do NOT ask the user to clarify product details that are present in the KB.

The search_blocks tool is ONLY for finding blocks inside the current document being edited.
It has no connection to the product knowledge base.`
    : `---

## KNOWLEDGE BASE AVAILABILITY

No product knowledge base is available for this project. For all Tier 1 product facts, rely exclusively on what the user tells you in this conversation. Do not invent or infer product-specific details.`
}`;

    // ── Documentation guideline section ───────────────────────────────────────

    const guidelineSection = projectSpecificGuidelinePrompt
      ? `\n\n---\n\n## DOCUMENTATION WRITING STANDARDS\n\nThis project has specific documentation guidelines loaded in <project_documentation_guidelines> tags at the start of the conversation. These PROJECT-SPECIFIC guidelines OVERRIDE the general documentation standards. Always apply them when writing or editing documentation for this project.`
      : documentationGuidelinePrompt
      ? `\n\n---\n\n## DOCUMENTATION WRITING STANDARDS\n\nApply these standards to all documentation you write or edit:\n\n${documentationGuidelinePrompt}`
      : "";

    // The checkable rules — lengths, formats, approved categories — rendered from
    // the same settings object the editor's live hints read, so the assistant
    // cannot advise something the editor will then flag.
    // Standards first, then the generated numbers. Both apply to every project;
    // neither is replaced by a project's own writing guideline.
    const editorialRulesSection = [
      editorialStandardsPrompt
        ? `\n\n---\n\n${editorialStandardsPrompt}`
        : "",
      `\n\n---\n\n## EDITORIAL RULES\n\n${editorialRulesPrompt}`,
    ].join("");

    // ── Editor tools section ──────────────────────────────────────────────────

    const editorToolsPrompt = editorEnabled
      ? `

---

## EDITOR TOOLS

You can directly edit the document using the tools below. Use them whenever the user asks you to add, modify, or remove content.

### Available Tools

**1. insert_blocks** — Insert new content into the document
- Parameters: \`{ blocks: [{ type, content, props?, children? }], position: "start"|"end"|"before"|"after", referenceBlockId?: string }\`
- Block types:
  - \`"paragraph"\` — Regular text
  - \`"heading"\` — Heading with \`props: { level: 1 | 2 | 3 }\`
  - \`"bulletListItem"\` — Bullet list item (NOT "list")
  - \`"numberedListItem"\` — Numbered list item (NOT "list")
  - \`"checkListItem"\` — Checkbox item with \`props: { checked: boolean }\`
  - \`"codeBlock"\` — Code block with \`props: { language: string }\`
- **\`content\` must be a plain text string.** Do NOT use HTML tags (\`<strong>\`, \`<em>\`, \`<b>\`, \`<code>\`, etc.) or markdown formatting (\`**bold**\`, \`*italic*\`). Plain text only — the editor handles rendering. HTML tags appear as literal characters to the user.

**2. update_block** — Modify an existing block
- Parameters: \`{ blockId: string, update: { type?, content?, props? } }\`
- Always search for the block first to get its ID.
- Same rule: \`content\` must be plain text, no HTML tags.

**3. delete_blocks** — Remove blocks
- Parameters: \`{ blockIds: [string, ...] }\`
- Always search for blocks first.

**4. search_blocks** — Find blocks by content or type
- Parameters: \`{ query?: string, type?: string }\`
- Returns exact or fuzzy matches with block IDs and match quality.

**5. get_blocks_structure** — Get full document layout
- Parameters: \`{}\`
- Returns all blocks with IDs and nesting hierarchy.

**6. replace_text** — Find and replace text across blocks
- Parameters: \`{ find: string, replace: string, blockIds?: [string, ...] }\`

### Tool Call Format

\`\`\`
[TOOL_CALL]
{
  "tool": "tool_name",
  "parameters": { ... }
}
[/TOOL_CALL]
\`\`\`

### CRITICAL: All content must go into the editor

When the user asks you to write, generate, add, or rewrite documentation:
- **ALWAYS** use \`insert_blocks\` to place the content into the document.
- **NEVER** write documentation content as plain text in your chat response.
- If you write content as plain text, the user is forced to manually copy-paste it — this defeats the purpose of the editor tools.
- A single \`insert_blocks\` call can contain ALL blocks for a full section or page — insert everything at once.

### Tool Usage Rules

- Write one brief sentence explaining what you are about to do, then emit the tool call.
- **INSERT / WRITE**: Use a single \`insert_blocks\` call containing all blocks. Do not split into multiple calls.
- **REWRITE**: Use \`delete_blocks\` followed immediately by \`insert_blocks\` in the **same response** — you already know what to delete and what to insert, so no intermediate result is needed.
- **UPDATE existing block**: First do \`search_blocks\` alone (you need the block ID from the result), then use the returned ID to \`update_block\` in the next response.
- **Multiple independent tool calls** in one response are allowed when the second call does not depend on the result of the first.
- For **fuzzy matches**: show the matched content to the user and confirm before updating.

### Workflow Examples

**Adding a new section:**
\`\`\`
[TOOL_CALL]
{
  "tool": "insert_blocks",
  "parameters": {
    "blocks": [
      { "type": "heading", "props": { "level": 2 }, "content": "Installation" },
      { "type": "paragraph", "content": "To install, run the following command:" },
      { "type": "codeBlock", "props": { "language": "bash" }, "content": "npm install my-package" }
    ],
    "position": "end"
  }
}
[/TOOL_CALL]
\`\`\`

**Rewriting an existing section (delete old + insert new in ONE response):**
\`\`\`
[TOOL_CALL]
{ "tool": "delete_blocks", "parameters": { "blockIds": ["block-10", "block-11", "block-12"] } }
[/TOOL_CALL]
[TOOL_CALL]
{
  "tool": "insert_blocks",
  "parameters": {
    "blocks": [
      { "type": "heading", "props": { "level": 2 }, "content": "Overview" },
      { "type": "paragraph", "content": "This section explains..." }
    ],
    "position": "end"
  }
}
[/TOOL_CALL]
\`\`\`

**Updating an existing heading (search first, then update):**
Step 1 — Search:
\`\`\`
[TOOL_CALL]
{ "tool": "search_blocks", "parameters": { "type": "heading", "query": "Getting Started" } }
[/TOOL_CALL]
\`\`\`
Step 2 — After seeing \`[Tool Result: ...]\` with the block ID, update:
\`\`\`
[TOOL_CALL]
{ "tool": "update_block", "parameters": { "blockId": "block-123", "update": { "content": "Quick Start Guide" } } }
[/TOOL_CALL]
\`\`\``
      : `

---

## EDITOR MODE

Direct editing is not active in this session. Provide your edits as suggested text that the user can apply manually. For inline editing, users can use the BlockNote AI toolbar (sparkles button).`;

    const systemPrompt = `${basePrompt}${guidelineSection}${editorialRulesSection}\n${editorToolsPrompt}`;

    // ── Build model messages ───────────────────────────────────────────────────

    if (!messages || messages.length === 0) {
      throw new Error("No messages provided");
    }

    const modelMessages: ModelMessage[] = messages.map(
      (m: { role: string; content: unknown }) => ({
        role: m.role as "user" | "assistant",
        content:
          typeof m.content === "string"
            ? m.content
            : Array.isArray(m.content)
            ? (m.content as Array<{ text?: string }>)
                .map((c) => c.text || c)
                .join("")
            : String(m.content),
      })
    );

    // ── Anthropic prompt caching ──────────────────────────────────────────────
    //
    // The KB is injected as a cached TextPart at the start of the first user
    // message. Anthropic caches the prefix up to and including this block for
    // 5 minutes (ephemeral TTL), so subsequent turns skip re-processing KB
    // tokens entirely.
    //
    // IMPORTANT: knowledgeBasePrompt must be a stable string across turns.
    // If its hash changes between turns, the cache will bust. Verify with the
    // hash logged above.

    let finalMessages: ModelMessage[] = modelMessages;

    console.log("[doc-chat] messages count:", modelMessages.length);
    console.log("[doc-chat] first message role:", modelMessages[0]?.role);
    console.log(
      "[doc-chat] first message content preview:",
      typeof modelMessages[0]?.content === "string"
        ? modelMessages[0].content.slice(0, 100)
        : JSON.stringify(modelMessages[0]?.content).slice(0, 100)
    );
    console.log(
      "[doc-chat] knowledgeBasePrompt length:",
      knowledgeBasePrompt.length
    );

    const firstUserIndex = modelMessages.findIndex((m) => m.role === "user");

    if (firstUserIndex !== -1 && (projectSpecificGuidelinePrompt || knowledgeBasePrompt)) {
      const firstUserMsg = modelMessages[firstUserIndex];
      const firstMsgText =
        typeof firstUserMsg.content === "string" ? firstUserMsg.content : "";

      const parts: TextPart[] = [];

      // Inject project-specific guideline as the first cache breakpoint
      if (projectSpecificGuidelinePrompt) {
        parts.push({
          type: "text",
          text: `<project_documentation_guidelines>\n${projectSpecificGuidelinePrompt}\n</project_documentation_guidelines>\n\nThe PROJECT DOCUMENTATION GUIDELINES above define the specific writing standards for this project. Apply them to every piece of documentation you write or edit. These override the general documentation guidelines.`,
          providerOptions: {
            anthropic: { cacheControl: { type: "ephemeral" } },
          },
        });
      }

      // Inject KB as the next cache breakpoint
      if (knowledgeBasePrompt) {
        parts.push({
          type: "text",
          text: `<knowledge_base>\n${knowledgeBasePrompt}\n</knowledge_base>\n\nThe PRODUCT KNOWLEDGE BASE above is your primary source of truth for all product-specific facts. Read it directly — it requires no searching or tool calls. Before writing any documentation, scan all sections for relevant information.`,
          providerOptions: {
            anthropic: { cacheControl: { type: "ephemeral" } },
          },
        });
      }

      parts.push({ type: "text", text: firstMsgText });

      finalMessages = [
        ...modelMessages.slice(0, firstUserIndex),
        { role: "user", content: parts },
        ...modelMessages.slice(firstUserIndex + 1),
      ];

      console.log(
        `[doc-chat] Injected into message index ${firstUserIndex}: projectGuideline=${!!projectSpecificGuidelinePrompt}, KB=${!!knowledgeBasePrompt}`
      );
    } else {
      console.warn(
        "[doc-chat] Injection skipped — no user message found or nothing to inject"
      );
    }

    // ── Stream response ───────────────────────────────────────────────────────

    const anthropic = createAnthropic({ apiKey: config.apiKey });

    const result = streamText({
      model: anthropic(config.defaultModel),
      system: systemPrompt,
      messages: finalMessages,
      // Use low temperature for documentation tasks — accuracy over creativity.
      // Falls back to config temperature only if documentContext is absent
      // (e.g. a general chat session, not a doc editing session).
      temperature: documentContext != null ? 0.1 : config.temperature,
      maxOutputTokens: config.maxTokens,
      onFinish: async (result) => {
        const usage = result.usage;
        const promptTokens = usage?.inputTokens || 0;
        const completionTokens = usage?.outputTokens || 0;

        try {
          await logAIUsage({
            userId: session?.user?.id,
            feature: "chat",
            model: config.defaultModel,
            promptTokens,
            completionTokens,
            durationMs: Date.now() - startTime,
            success: true,
          });
        } catch (err) {
          console.error("[Doc Chat API] Failed to log usage:", err);
        }
      },
    });

    const response = result.toTextStreamResponse();
    response.headers.set("x-vercel-ai-data-stream", "v1");
    return response;
  } catch (error) {
    console.error("[doc-chat] Error:", error);
    console.error(
      "[doc-chat] Error stack:",
      error instanceof Error ? error.stack : "No stack"
    );

    const config = await getAIConfig();
    await logAIUsage({
      userId: session?.user?.id,
      feature: "chat",
      model: config.defaultModel,
      promptTokens: 0,
      completionTokens: 0,
      durationMs: Date.now() - startTime,
      success: false,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });

    return new Response(
      JSON.stringify({
        error: "Failed to process chat request",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
