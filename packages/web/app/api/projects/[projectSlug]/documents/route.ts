import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/postgres";
import { ContentManager } from "@/lib/db/ContentManager";
import { checkProjectAccess } from "@/lib/project-helpers";
import { NextRequest } from "next/server";

/**
 * List published documents for a project (used by Redirects settings combobox)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectSlug } = await params;
  const sql = getDb();

  const [project] = await sql`
    SELECT id FROM projects WHERE slug = ${projectSlug} LIMIT 1
  `;

  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const hasAccess = await checkProjectAccess(session.user.id, project.id, "viewer");
  if (!hasAccess) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const cm = ContentManager.create();
  const docs = await cm.listDocs(project.id);
  return Response.json({ documents: docs });
}

/**
 * Create a new document under a section
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectSlug } = await params;
  const { title, slug: rawSlug, sectionSlug: rawSectionSlug, description } = await request.json();

  if (!title || !rawSlug || !rawSectionSlug) {
    return Response.json(
      { error: "Title, slug, and sectionSlug are required" },
      { status: 400 }
    );
  }

  const slug = rawSlug.replace(/^\/+|\/+$/g, "");
  const sectionSlug = rawSectionSlug.replace(/^\/+|\/+$/g, "");

  const sql = getDb();

  // Get project
  const [project] = await sql`
    SELECT id FROM projects WHERE slug = ${projectSlug}
  `;

  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  // Check access
  const hasAccess = await checkProjectAccess(
    session.user.id,
    project.id,
    "editor"
  );
  if (!hasAccess) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Create the document slug (section/document)
  const fullSlug = `${sectionSlug}/${slug}`;

  // Check if document already exists
  const [existing] = await sql`
    SELECT id FROM documents
    WHERE project_id = ${project.id} AND slug = ${fullSlug}
  `;

  if (existing) {
    return Response.json(
      { error: "Document with this slug already exists" },
      { status: 409 }
    );
  }

  // Create initial blocks
  const initialBlocks = [
    {
      id: "1",
      type: "heading",
      props: { level: 1 },
      content: [{ type: "text", text: title, styles: {} }],
      children: [],
    },
    {
      id: "2",
      type: "paragraph",
      props: {},
      content: [
        {
          type: "text",
          text: "Start writing your documentation here...",
          styles: {},
        },
      ],
      children: [],
    },
  ];

  // Create document
  const [doc] = await sql`
    INSERT INTO documents (
      project_id, slug, title, description, blocks, published, created_by
    )
    VALUES (
      ${project.id},
      ${fullSlug},
      ${title},
      ${description || null},
      ${sql.json(initialBlocks)},
      false,
      ${session.user.id}
    )
    RETURNING id, slug, title, description
  `;

  // Get current navigation
  const [nav] = await sql`
    SELECT structure FROM navigation WHERE project_id = ${project.id}
  `;

  if (nav) {
    const structure = nav.structure;

    // Find the section and add the document
    // Check both path (old format) and children paths (new category format)
    const section = structure.routes?.find((r: any) => {
      // Check direct path match (old format)
      if (r.path === `/docs/${sectionSlug}`) {
        return true;
      }
      // Check if this is a category with children that match the section (new format)
      if (r.children && r.children.length > 0) {
        // Check if any child's path starts with this section slug
        return r.children.some((child: any) => {
          const childSlug = child.slug || child.path?.replace('/docs/', '');
          return childSlug?.startsWith(sectionSlug + '/') || childSlug === sectionSlug;
        });
      }
      return false;
    });

    if (section) {
      if (!section.children) {
        section.children = [];
      }

      section.children.push({
        id: doc.id,
        title,
        path: `/docs/${fullSlug}`,
        slug: fullSlug,
      });

      // Update navigation
      await sql`
        UPDATE navigation
        SET structure = ${sql.json(structure)}
        WHERE project_id = ${project.id}
      `;
    }
  }

  return Response.json({ success: true, document: doc });
}
