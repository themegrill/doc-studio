import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/postgres";
import { checkProjectAccess } from "@/lib/project-helpers";
import { NextRequest } from "next/server";

/**
 * Create a section overview document for an existing section
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
  const { sectionSlug, title } = await request.json();

  if (!sectionSlug || !title) {
    return Response.json(
      { error: "Section slug and title are required" },
      { status: 400 }
    );
  }

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

  // Check if overview already exists
  const [existing] = await sql`
    SELECT id FROM documents
    WHERE project_id = ${project.id} AND slug = ${sectionSlug}
  `;

  if (existing) {
    return Response.json(
      { error: "Section overview already exists" },
      { status: 409 }
    );
  }

  // Create initial blocks for overview
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
          text: "Add an overview or introduction for this section...",
          styles: {},
        },
      ],
      children: [],
    },
  ];

  // Create the section overview document
  const [doc] = await sql`
    INSERT INTO documents (
      project_id, slug, title, blocks, published, created_by
    )
    VALUES (
      ${project.id},
      ${sectionSlug},
      ${title},
      ${sql.json(initialBlocks as any)},
      true,
      ${session.user.id}
    )
    RETURNING id, slug, title
  `;

  return Response.json({ success: true, document: doc });
}

/**
 * Delete a section overview document
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectSlug } = await params;
  const { searchParams } = new URL(request.url);
  const sectionSlug = searchParams.get("sectionSlug");

  if (!sectionSlug) {
    return Response.json(
      { error: "Section slug is required" },
      { status: 400 }
    );
  }

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

  // Check if overview exists
  const [existing] = await sql`
    SELECT id FROM documents
    WHERE project_id = ${project.id} AND slug = ${sectionSlug}
  `;

  if (!existing) {
    return Response.json(
      { error: "Section overview not found" },
      { status: 404 }
    );
  }

  // Delete the section overview document
  await sql`
    DELETE FROM documents
    WHERE project_id = ${project.id} AND slug = ${sectionSlug}
  `;

  return Response.json({ success: true });
}
