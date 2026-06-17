import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/postgres";
import { parseBetterDocsCSV, getDocumentStats, ParsedDocument, ParseResult } from "@/lib/migration/csv-parser";
import { convertHTMLToBlockNote } from "@/lib/migration/html-to-blocknote";
import { getAIConfig } from "@/lib/ai-config";
import { invalidateKbCache } from "@/lib/kb-cache";
import Anthropic from "@anthropic-ai/sdk";
import type { JSONValue } from "postgres";

export const maxDuration = 300;

interface RouteParams {
  params: Promise<{
    projectSlug: string;
  }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { projectSlug } = await params;
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const action = formData.get("action") as string;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const sql = getDb();

    // Get project
    const [project] = await sql`
      SELECT id, name, slug
      FROM projects
      WHERE slug = ${projectSlug}
    `;

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Check user permissions
    const [userData] = await sql`
      SELECT role FROM users WHERE id = ${session.user.id}
    `;

    const isSuperAdmin =
      userData?.role === "super_admin" || userData?.role === "admin";

    const [membership] = await sql`
      SELECT role FROM project_members
      WHERE project_id = ${project.id} AND user_id = ${session.user.id}
    `;

    if (
      !isSuperAdmin &&
      (!membership || !["owner", "admin"].includes(membership.role))
    ) {
      return NextResponse.json(
        { error: "You don't have permission to import into this project" },
        { status: 403 }
      );
    }

    // Read CSV file
    const csvText = await file.text();

    // Parse CSV
    const parseResult = await parseBetterDocsCSV(csvText);
    const { documents, categories } = parseResult;

    if (documents.length === 0) {
      return NextResponse.json(
        { error: "No valid documents found in CSV file" },
        { status: 400 }
      );
    }

    // If action is "analyze", just return stats
    if (action === "analyze") {
      const stats = getDocumentStats(documents, categories);
      return NextResponse.json({ stats });
    }

    // If action is "import", perform the import
    if (action === "import") {
      const result = await importDocuments(
        documents,
        categories,
        project.id,
        session.user.id,
        sql
      );
      return NextResponse.json({ result });
    }

    // If action is "extract-knowledge", process one batch and return JSON.
    // The frontend calls this repeatedly with increasing startIndex until done=true.
    if (action === "extract-knowledge") {
      const aiConfig = await getAIConfig();
      if (!aiConfig.apiKey) {
        return NextResponse.json(
          { error: "AI API key is not configured" },
          { status: 500 }
        );
      }

      const startIndex = parseInt((formData.get("startIndex") as string) || "0", 10);
      const batchSize = parseInt((formData.get("batchSize") as string) || "20", 10);

      const result = await extractKnowledgeBaseBatch(
        parseResult,
        project.id,
        projectSlug,
        file.name,
        aiConfig.apiKey,
        aiConfig.defaultModel || "claude-sonnet-4-6",
        sql,
        startIndex,
        batchSize
      );
      return NextResponse.json({ result });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("[POST /api/projects/[projectSlug]/import] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}

/**
 * Import documents into the database
 */
async function importDocuments(
  documents: ParsedDocument[],
  categories: Record<
    string,
    import("@/lib/migration/csv-parser").CategoryDefinition
  >,
  projectId: string,
  userId: string,
  sql: ReturnType<typeof getDb>
): Promise<{
  success: boolean;
  imported: number;
  skipped: number;
  failed: number;
  errors: string[];
}> {
  let imported = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const doc of documents) {
    try {
      // Convert HTML to BlockNote JSON
      const blocks = convertHTMLToBlockNote(doc.content);
      const jsonBlocks = blocks as unknown as JSONValue;

      // Check if document with slug already exists
      const [existing] = await sql`
        SELECT id FROM documents
        WHERE project_id = ${projectId} AND slug = ${doc.slug}
      `;

      if (existing) {
        // Slug already exists — skip to preserve existing content
        skipped++;
        continue;
      }

      await sql`
        INSERT INTO documents (
          project_id,
          slug,
          title,
          description,
          blocks,
          published,
          order_index,
          created_by,
          updated_by
        ) VALUES (
          ${projectId},
          ${doc.slug},
          ${doc.title},
          ${doc.excerpt || null},
          ${sql.json(jsonBlocks)},
          ${doc.status === "publish"},
          ${doc.order},
          ${userId},
          ${userId}
        )
      `;

      imported++;
    } catch (error) {
      failed++;
      const errorMsg = `Failed to import "${doc.title}": ${
        error instanceof Error ? error.message : "Unknown error"
      }`;
      errors.push(errorMsg);
      console.error(errorMsg);
    }
  }

  // Update navigation structure with category information
  try {
    await updateNavigationStructure(projectId, documents, categories, sql);
  } catch (error) {
    console.error("Failed to update navigation:", error);
    errors.push("Failed to update navigation structure");
  }

  return {
    success: imported > 0,
    imported,
    skipped,
    failed,
    errors: errors.slice(0, 10), // Limit to first 10 errors
  };
}

/**
 * Update navigation structure after import with hierarchical categories
 */
async function updateNavigationStructure(
  projectId: string,
  parsedDocuments: ParsedDocument[],
  categories: Record<
    string,
    import("@/lib/migration/csv-parser").CategoryDefinition
  >,
  sql: ReturnType<typeof getDb>
): Promise<void> {
  // Get all documents from database to get their IDs
  const dbDocs = await sql`
    SELECT id, slug, title, order_index
    FROM documents
    WHERE project_id = ${projectId}
    ORDER BY order_index ASC, title ASC
  `;

  // Create a map of slug -> document ID
  const slugToIdMap: Record<
    string,
    { id: string; title: string; order: number }
  > = {};
  type DocRow = {
    id: string;
    slug: string;
    title: string;
    order_index: number;
  };

  dbDocs.forEach((doc) => {
    const d = doc as DocRow;

    slugToIdMap[d.slug] = {
      id: d.id,
      title: d.title,
      order: d.order_index,
    };
  });

  // Group documents by their first category
  const categoryGroups: Record<string, ParsedDocument[]> = {};
  const uncategorized: ParsedDocument[] = [];

  parsedDocuments.forEach((doc) => {
    if (doc.categoryIds && doc.categoryIds.length > 0) {
      const categoryId = doc.categoryIds[0]; // Use first category
      if (!categoryGroups[categoryId]) {
        categoryGroups[categoryId] = [];
      }
      categoryGroups[categoryId].push(doc);
    } else {
      uncategorized.push(doc);
    }
  });

  // Build new routes from the imported documents using the same path schema
  // as manually-created docs: category node has `path`, children have `orderIndex`.
  type NavChild = {
    id: string;
    title: string;
    path: string;
    slug: string;
    orderIndex: number;
  };
  type NavGroup = {
    path: string;
    title: string;
    children: NavChild[];
  };
  type NavDoc = {
    id: string;
    title: string;
    path: string;
    slug: string;
    orderIndex: number;
  };

  const newGroups: NavGroup[] = [];
  const newTopLevel: NavDoc[] = [];

  Object.keys(categoryGroups)
    .sort((a, b) => {
      const orderA = categories[a]?.order ?? 999;
      const orderB = categories[b]?.order ?? 999;
      return orderA - orderB;
    })
    .forEach((categoryId) => {
      const category = categories[categoryId];
      const docs = categoryGroups[categoryId];

      const children: NavChild[] = docs
        .filter((doc) => slugToIdMap[doc.slug])
        .sort((a, b) => a.order - b.order)
        .map((doc, idx) => {
          const dbDoc = slugToIdMap[doc.slug];
          return {
            id: dbDoc.id,
            title: dbDoc.title,
            path: `/docs/${doc.slug}`,
            slug: doc.slug,
            orderIndex: idx,
          };
        });

      if (children.length > 0) {
        const categoryName = category?.name || `Category ${categoryId}`;
        const categorySlug = categoryName
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
        newGroups.push({
          path: `/docs/${categorySlug}`,
          title: categoryName,
          children,
        });
      }
    });

  uncategorized.forEach((doc, idx) => {
    if (slugToIdMap[doc.slug]) {
      const dbDoc = slugToIdMap[doc.slug];
      newTopLevel.push({
        id: dbDoc.id,
        title: dbDoc.title,
        path: `/docs/${doc.slug}`,
        slug: doc.slug,
        orderIndex: idx,
      });
    }
  });

  // Load existing navigation and merge — never replace
  const [existingNav] = await sql`
    SELECT id, structure FROM navigation
    WHERE project_id = ${projectId}
  `;

  type ExistingRoute = Record<string, unknown>;

  let mergedRoutes: ExistingRoute[];

  if (existingNav) {
    const existing = (
      typeof existingNav.structure === "string"
        ? JSON.parse(existingNav.structure)
        : existingNav.structure
    ) as { routes?: ExistingRoute[] };

    // Strip unresolved placeholder groups left by previous failed imports
    // ("Category 5", "Category 12", etc.) so a fresh import can replace them.
    const badCategoryTitle = /^category\s+\d+$/i;
    mergedRoutes = (existing.routes ?? []).filter(
      (r) => !badCategoryTitle.test((r.title as string) ?? "")
    );

    // Merge category groups: match by title OR by path, then append children.
    for (const group of newGroups) {
      const existingGroup = mergedRoutes.find(
        (r) =>
          (typeof r.title === "string" &&
            r.title.toLowerCase() === group.title.toLowerCase()) ||
          (typeof r.path === "string" && r.path === group.path)
      ) as (ExistingRoute & { children?: NavChild[] }) | undefined;

      if (existingGroup) {
        const existingChildIds = new Set(
          (existingGroup.children || []).map((c) => c.id)
        );
        const newChildren = group.children.filter(
          (c) => !existingChildIds.has(c.id)
        );
        if (newChildren.length > 0) {
          existingGroup.children = [
            ...(existingGroup.children || []),
            ...newChildren,
          ];
        }
      } else {
        mergedRoutes.push(group as unknown as ExistingRoute);
      }
    }

    // Append top-level docs that aren't already present
    const existingTopIds = new Set(
      mergedRoutes.filter((r) => !r.children).map((r) => r.id as string)
    );
    for (const doc of newTopLevel) {
      if (!existingTopIds.has(doc.id)) {
        mergedRoutes.push(doc as unknown as ExistingRoute);
      }
    }
  } else {
    mergedRoutes = [
      ...(newGroups as unknown as ExistingRoute[]),
      ...(newTopLevel as unknown as ExistingRoute[]),
    ];
  }

  const navigationStructure = {
    title: "Documentation",
    version: "1.0",
    routes: mergedRoutes,
  };

  const jsonNavigation = JSON.parse(
    JSON.stringify(navigationStructure)
  ) as JSONValue;

  if (existingNav) {
    await sql`
      UPDATE navigation
      SET structure = ${sql.json(jsonNavigation)},
          updated_at = NOW()
      WHERE id = ${existingNav.id}
    `;
  } else {
    await sql`
      INSERT INTO navigation (project_id, structure)
      VALUES (${projectId}, ${sql.json(jsonNavigation)})
    `;
  }
}

// ─── Knowledge Base Extraction ────────────────────────────────────────────────

const KB_EXTRACTION_SYSTEM_PROMPT = `You are a technical knowledge extraction specialist.
Your job is to read a documentation article and extract the ESSENTIAL knowledge from it.
Some content may be slightly outdated, but treat UI paths and navigation steps as valid
unless they look significantly version-specific or clearly deprecated.

Return a JSON object with exactly these keys:

{
  "title": "Clean, concise title for this knowledge chunk",
  "summary": "1-2 sentence summary of what this doc covers",
  "feature_or_topic": "The specific product feature, integration, or concept this covers",
  "key_concepts": ["list", "of", "core", "concepts", "or", "terms"],
  "prerequisites": ["things", "the", "user", "needs", "before", "using", "this"],
  "steps_or_instructions": [
    "Step 1: ...",
    "Step 2: ..."
  ],
  "important_notes": ["warnings, caveats, or tips worth highlighting"],
  "configuration_options": [
    {"name": "option name", "description": "what it does"}
  ],
  "related_topics": ["other features or docs this connects to"],
  "staleness_flags": ["only flag things that are CLEARLY outdated: hardcoded version numbers, deprecated API names, or UI paths that reference features known to be removed"],
  "confidence": "high | medium | low — your confidence that extracted info is still accurate"
}

Rules:
- Keep navigation steps and UI paths as written — they are useful even if minor labels have changed.
- Preserve menu paths like 'Settings → Save and Continue' as-is in steps_or_instructions.
- Only add to staleness_flags if something is explicitly version-locked (e.g. 'v1.2 only'),
  references a known deprecated feature, or contradicts itself within the same doc.
- Do NOT flag every UI reference as stale — assume the product structure is mostly intact.
- Extract both WHAT the feature does and HOW to use it, including specific UI steps.
- If the doc is very short or unclear, still extract what you can — set confidence to "low".
- Return ONLY valid JSON, no markdown fences, no explanation.`;

interface ExtractedKnowledgeDoc {
  title?: string;
  summary?: string;
  feature_or_topic?: string;
  key_concepts?: string[];
  prerequisites?: string[];
  steps_or_instructions?: string[];
  important_notes?: string[];
  configuration_options?: { name: string; description: string }[];
  related_topics?: string[];
  staleness_flags?: string[];
  confidence?: "high" | "medium" | "low";
  original_title: string;
  slug?: string;
}

interface FaqEntry {
  question: string;
  answer: string;
  slug: string;
}

interface DocsKnowledgeBaseContent {
  extracted_at: string;
  source_file: string;
  model_used: string;
  total_docs: number;
  extracted: number;
  skipped: number;
  documents: ExtractedKnowledgeDoc[];
  faqs: FaqEntry[];
}

function htmlToPlainText(html: string): string {
  if (!html || typeof html !== "string") return "";
  let cleaned = html.replace(/<!--\s*\/?wp:[^>]*-->/g, "");
  cleaned = cleaned.replace(/<\/?(p|div|h[1-6]|li|br|tr|blockquote)[^>]*>/gi, "\n");
  cleaned = cleaned.replace(/<[^>]+>/g, "");
  cleaned = cleaned
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(parseInt(c, 10)));
  return cleaned.split("\n").map((l) => l.trim())
    .filter((l, i, arr) => l !== "" || arr[i - 1] !== "")
    .join("\n").trim();
}

async function extractSingleDoc(
  doc: ParsedDocument,
  client: Anthropic,
  model: string
): Promise<ExtractedKnowledgeDoc | null> {
  const bodyText = htmlToPlainText(doc.content);
  const excerptText = htmlToPlainText(doc.excerpt || "");

  if (!bodyText.trim()) return null;

  const userMessage = `DOCUMENTATION ARTICLE
Title: ${doc.title}
Slug: ${doc.slug || ""}
Excerpt: ${excerptText || "(none)"}

--- CONTENT ---
${bodyText.slice(0, 8000)}`;

  const MAX_RETRIES = 3;
  const BASE_BACKOFF = 2000;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const message = await client.messages.create({
        model,
        max_tokens: 1500,
        system: KB_EXTRACTION_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      });

      const raw = message.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { type: "text"; text: string }).text)
        .join("");

      // Strip markdown fences if present
      let cleaned = raw.trim();
      const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fence) cleaned = fence[1].trim();

      const parsed = JSON.parse(cleaned);
      return { ...parsed, original_title: doc.title, slug: doc.slug };
    } catch (err) {
      const isRateLimit =
        (err as { status?: number }).status === 429 ||
        (err instanceof Error && err.message.toLowerCase().includes("rate_limit"));
      const isSyntaxErr = err instanceof SyntaxError;

      if ((isRateLimit || isSyntaxErr) && attempt < MAX_RETRIES - 1) {
        await new Promise((res) => setTimeout(res, BASE_BACKOFF * Math.pow(2, attempt)));
        continue;
      }
      console.error(`[KB Extract] Failed for "${doc.title}":`, err);
      return null;
    }
  }
  return null;
}

async function extractKnowledgeBaseBatch(
  parseResult: ParseResult,
  projectId: string,
  projectSlug: string,
  sourceFile: string,
  apiKey: string,
  model: string,
  sql: ReturnType<typeof getDb>,
  startIndex: number,
  batchSize: number
): Promise<{
  extracted: number;
  skipped: number;
  done: boolean;
  nextIndex: number;
  totalPublished: number;
}> {
  const client = new Anthropic({ apiKey });
  const publishedDocs = parseResult.documents.filter((d) => d.status === "publish");
  const totalPublished = publishedDocs.length;
  const batch = publishedDocs.slice(startIndex, startIndex + batchSize);
  const isFirstBatch = startIndex === 0;
  const isDone = startIndex + batchSize >= totalPublished;

  // Process this batch with concurrency 5
  const extractedDocs: ExtractedKnowledgeDoc[] = [];
  let skipped = 0;
  let nextIdx = 0;

  async function worker() {
    while (true) {
      const i = nextIdx++;
      if (i >= batch.length) break;
      const result = await extractSingleDoc(batch[i], client, model);
      if (result) extractedDocs.push(result);
      else skipped++;
    }
  }
  await Promise.all(Array.from({ length: Math.min(5, batch.length) }, worker));

  // Persist: first batch creates/replaces, subsequent batches append
  const [existing] = await sql`
    SELECT id, content FROM project_knowledge_bases
    WHERE project_id = ${projectId} AND type = 'docs-site'
  `;

  const faqs: FaqEntry[] = isDone
    ? (parseResult.faqs || []).map((f) => ({
        question: f.title,
        answer: htmlToPlainText(f.answer),
        slug: f.slug,
      }))
    : [];

  if (isFirstBatch) {
    // Write fresh KB for this project
    const content: DocsKnowledgeBaseContent = {
      extracted_at: new Date().toISOString(),
      source_file: sourceFile,
      model_used: model,
      total_docs: totalPublished,
      extracted: extractedDocs.length,
      skipped,
      documents: extractedDocs,
      faqs,
    };
    const jsonContent = content as unknown as JSONValue;
    const jsonMeta = { sourceFile, extractedAt: content.extracted_at } as unknown as JSONValue;

    if (existing) {
      await sql`
        UPDATE project_knowledge_bases
        SET content = ${sql.json(jsonContent)}, metadata = ${sql.json(jsonMeta)}, updated_at = NOW()
        WHERE id = ${existing.id}
      `;
    } else {
      await sql`
        INSERT INTO project_knowledge_bases (project_id, type, content, metadata)
        VALUES (${projectId}, 'docs-site', ${sql.json(jsonContent)}, ${sql.json(jsonMeta)})
      `;
    }
  } else if (existing) {
    // Append new docs to the existing documents array
    const prev = (typeof existing.content === "string"
      ? JSON.parse(existing.content)
      : existing.content) as DocsKnowledgeBaseContent;

    const merged: DocsKnowledgeBaseContent = {
      ...prev,
      extracted: (prev.extracted || 0) + extractedDocs.length,
      skipped: (prev.skipped || 0) + skipped,
      documents: [...(prev.documents || []), ...extractedDocs],
      faqs: isDone ? faqs : (prev.faqs || []),
    };
    const jsonMerged = merged as unknown as JSONValue;

    await sql`
      UPDATE project_knowledge_bases
      SET content = ${sql.json(jsonMerged)}, updated_at = NOW()
      WHERE id = ${existing.id}
    `;
  }

  if (isDone) invalidateKbCache(projectSlug);

  return {
    extracted: extractedDocs.length,
    skipped,
    done: isDone,
    nextIndex: startIndex + batchSize,
    totalPublished,
  };
}
