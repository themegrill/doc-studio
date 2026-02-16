import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/postgres";
import { parseBetterDocsCSV, getDocumentStats, ParsedDocument } from "@/lib/migration/csv-parser";
import { convertHTMLToBlockNote } from "@/lib/migration/html-to-blocknote";

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

    if (!isSuperAdmin && (!membership || !["owner", "admin"].includes(membership.role))) {
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

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("[POST /api/projects/[projectSlug]/import] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Import documents into the database
 */
async function importDocuments(
  documents: ParsedDocument[],
  categories: Record<string, import("@/lib/migration/csv-parser").CategoryDefinition>,
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
            blocks = ${sql.json(blocks)},
            published = ${doc.status === 'publish'},
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
            ${sql.json(blocks)},
            ${doc.status === 'publish'},
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
  categories: Record<string, import("@/lib/migration/csv-parser").CategoryDefinition>,
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
  const slugToIdMap: Record<string, { id: string; title: string; order: number }> = {};
  dbDocs.forEach((doc: { id: string; slug: string; title: string; order_index: number }) => {
    slugToIdMap[doc.slug] = {
      id: doc.id,
      title: doc.title,
      order: doc.order_index,
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

  console.log("[Import] Created navigation structure with", routes.length, "routes");
  console.log("[Import] First 3 routes:", routes.slice(0, 3).map((r: any) => ({
    title: r.title,
    id: r.id,
    path: r.path,
    childrenCount: r.children?.length || 0
  })));

  // Update or insert navigation
  const [existingNav] = await sql`
    SELECT id FROM navigation
    WHERE project_id = ${projectId}
  `;

  if (existingNav) {
    await sql`
      UPDATE navigation
      SET structure = ${sql.json(navigationStructure)},
          updated_at = NOW()
      WHERE id = ${existingNav.id}
    `;
  } else {
    await sql`
      INSERT INTO navigation (project_id, structure)
      VALUES (${projectId}, ${sql.json(navigationStructure)})
    `;
  }
}
