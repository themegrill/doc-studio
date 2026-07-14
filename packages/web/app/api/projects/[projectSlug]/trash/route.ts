import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/postgres";
import { checkProjectAccess } from "@/lib/project-helpers";
import { ContentManager } from "@/lib/db/ContentManager";
import { NextRequest } from "next/server";

/**
 * List documents currently in the trash for a project.
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
    SELECT id FROM projects WHERE slug = ${projectSlug}
  `;
  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const hasAccess = await checkProjectAccess(session.user.id, project.id, "editor");
  if (!hasAccess) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const cm = ContentManager.create();
  const documents = await cm.listTrashedDocs(project.id);

  return Response.json({ documents });
}

/**
 * Restore or permanently delete a trashed document.
 * Body: { action: "restore" | "purge", slug: string }
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
  const { action, slug } = await request.json();

  if (!slug || (action !== "restore" && action !== "purge")) {
    return Response.json(
      { error: "A valid action ('restore' or 'purge') and slug are required" },
      { status: 400 }
    );
  }

  const sql = getDb();

  const [project] = await sql`
    SELECT id FROM projects WHERE slug = ${projectSlug}
  `;
  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const hasAccess = await checkProjectAccess(session.user.id, project.id, "editor");
  if (!hasAccess) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Confirm the document is actually in the trash before acting on it.
  const [trashed] = await sql`
    SELECT id FROM documents
    WHERE project_id = ${project.id} AND slug = ${slug} AND deleted_at IS NOT NULL
    LIMIT 1
  `;
  if (!trashed) {
    return Response.json(
      { error: "Document not found in trash" },
      { status: 404 }
    );
  }

  const cm = ContentManager.create();
  const success =
    action === "restore"
      ? await cm.restoreDoc(project.id, slug)
      : await cm.permanentlyDeleteDoc(project.id, slug);

  if (!success) {
    return Response.json(
      { error: `Failed to ${action} document` },
      { status: 500 }
    );
  }

  return Response.json({ success: true });
}
