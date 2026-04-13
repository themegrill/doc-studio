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

    // If action is "extract-knowledge", extract KB with Claude and save to DB
    if (action === "extract-knowledge") {
      const aiConfig = await getAIConfig();
      if (!aiConfig.apiKey) {
        return NextResponse.json(
          { error: "AI API key is not configured" },
          { status: 500 }
        );
      }
      const result = await extractKnowledgeBase(
        parseResult,
        project.id,
        projectSlug,
        file.name,
        aiConfig.apiKey,
        aiConfig.defaultModel || "claude-sonnet-4-6",
        sql
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
  failed: number;
  errors: string[];
}> {
  let imported = 0;
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
        // Update existing document (overwrite)
        await sql`
          UPDATE documents
          SET
            title = ${doc.title},
            description = ${doc.excerpt || null},
            blocks = ${sql.json(jsonBlocks)},
            published = ${doc.status === "publish"},
            order_index = ${doc.order},
            updated_by = ${userId},
            updated_at = NOW()
          WHERE id = ${existing.id}
        `;
      } else {
        // Insert new document
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
      }

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

  // Build hierarchical navigation structure
  const routes: unknown[] = [];

  // Add categorized sections (sorted by category order from CSV)
  Object.keys(categoryGroups)
    .sort((a, b) => {
      const orderA = categories[a]?.order ?? 999;
      const orderB = categories[b]?.order ?? 999;
      return orderA - orderB;
    })
    .forEach((categoryId) => {
      const category = categories[categoryId];
      const docs = categoryGroups[categoryId];

      const children = docs
        .filter((doc) => slugToIdMap[doc.slug])
        .sort((a, b) => a.order - b.order)
        .map((doc) => {
          const dbDoc = slugToIdMap[doc.slug];
          return {
            id: dbDoc.id,
            title: dbDoc.title,
            path: `/docs/${doc.slug}`,
            slug: doc.slug,
          };
        });

      if (children.length > 0) {
        const categoryName = category?.name || `Category ${categoryId}`;
        routes.push({
          id: `category-${categoryId}`,
          title: categoryName,
          children,
        });
      }
    });

  // Add uncategorized documents at the end
  uncategorized.forEach((doc) => {
    if (slugToIdMap[doc.slug]) {
      const dbDoc = slugToIdMap[doc.slug];
      routes.push({
        id: dbDoc.id,
        title: dbDoc.title,
        path: `/docs/${doc.slug}`,
        slug: doc.slug,
      });
    }
  });

  const navigationStructure = {
    title: "Documentation",
    version: "1.0",
    routes,
  };

  console.log(
    "[Import] Created navigation structure with",
    routes.length,
    "routes"
  );
  console.log(
    "[Import] First 3 routes:",
    routes.slice(0, 3).map((r: any) => ({
      title: r.title,
      id: r.id,
      path: r.path,
      childrenCount: r.children?.length || 0,
    }))
  );

  // Update or insert navigation
  const [existingNav] = await sql`
    SELECT id FROM navigation
    WHERE project_id = ${projectId}
  `;

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
Your job is to read a documentation article (which may be outdated, written inconsistently,
or describe UI that has changed) and extract the ESSENTIAL, DURABLE knowledge from it.

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
  "important_notes": ["warnings, caveats, or tips that are likely stable over time"],
  "configuration_options": [
    {"name": "option name", "description": "what it does"}
  ],
  "related_topics": ["other features or docs this connects to"],
  "staleness_flags": ["list anything that looks UI-specific, version-specific, or likely outdated"],
  "confidence": "high | medium | low — your confidence that extracted info is still accurate"
}

Rules:
- Extract WHAT the feature does and HOW it works conceptually, not WHERE buttons are in the UI.
- If steps reference specific UI locations, rephrase them as intentions:
  "Navigate to Settings → Save and Continue" → "Find the Save and Continue settings panel"
- Flag anything that is a screenshot description, exact menu path, or version number in staleness_flags.
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

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) break;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function extractKnowledgeBase(
  parseResult: ParseResult,
  projectId: string,
  projectSlug: string,
  sourceFile: string,
  apiKey: string,
  model: string,
  sql: ReturnType<typeof getDb>
): Promise<{ success: boolean; extracted: number; skipped: number }> {
  const client = new Anthropic({ apiKey });

  // Only process published docs
  const publishedDocs = parseResult.documents.filter((d) => d.status === "publish");

  console.log(`[KB Extract] Processing ${publishedDocs.length} docs with model=${model}`);

  const extractedDocs: ExtractedKnowledgeDoc[] = [];
  let skipped = 0;

  const results = await runWithConcurrency(publishedDocs, 5, async (doc) => {
    return extractSingleDoc(doc, client, model);
  });

  results.forEach((r, i) => {
    if (r) {
      extractedDocs.push(r);
    } else {
      skipped++;
      console.log(`[KB Extract] Skipped: ${publishedDocs[i].title}`);
    }
  });

  // Extract FAQs parsed by csv-parser
  const faqs: FaqEntry[] = (parseResult.faqs || []).map((f) => ({
    question: f.title,
    answer: htmlToPlainText(f.answer),
    slug: f.slug,
  }));

  const content: DocsKnowledgeBaseContent = {
    extracted_at: new Date().toISOString(),
    source_file: sourceFile,
    model_used: model,
    total_docs: publishedDocs.length,
    extracted: extractedDocs.length,
    skipped,
    documents: extractedDocs,
    faqs,
  };

  const jsonContent = content as unknown as JSONValue;

  // Upsert into project_knowledge_bases with type 'docs-site'
  const [existing] = await sql`
    SELECT id FROM project_knowledge_bases
    WHERE project_id = ${projectId} AND type = 'docs-site'
  `;

  if (existing) {
    await sql`
      UPDATE project_knowledge_bases
      SET content = ${sql.json(jsonContent)},
          metadata = ${sql.json({ sourceFile, extractedAt: content.extracted_at } as unknown as JSONValue)},
          updated_at = NOW()
      WHERE id = ${existing.id}
    `;
  } else {
    await sql`
      INSERT INTO project_knowledge_bases (project_id, type, content, metadata)
      VALUES (
        ${projectId},
        'docs-site',
        ${sql.json(jsonContent)},
        ${sql.json({ sourceFile, extractedAt: content.extracted_at } as unknown as JSONValue)}
      )
    `;
  }

  console.log(`[KB Extract] Done. Extracted=${extractedDocs.length}, Skipped=${skipped}, FAQs=${faqs.length}`);
  invalidateKbCache(projectSlug);
  return { success: extractedDocs.length > 0, extracted: extractedDocs.length, skipped };
}
