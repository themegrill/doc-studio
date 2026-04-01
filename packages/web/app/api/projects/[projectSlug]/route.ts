import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/postgres";
import { NextRequest } from "next/server";

/**
 * Get public project details (name, slug, description)
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> }
) {
  const { projectSlug } = await params;
  const sql = getDb();

  const [project] = await sql`
    SELECT name, slug, description, settings, metadata AS metadata FROM projects WHERE slug = ${projectSlug} LIMIT 1
  `;

  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  return Response.json(project);
}

/**
 * Update project details (name, slug)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectSlug } = await params;
  const { name, slug, metadata } = await request.json();

  if (!name?.trim() || !slug?.trim()) {
    return Response.json(
      { error: "Name and slug are required" },
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

  // Check if user is super admin
  const [userData] = await sql`
    SELECT role FROM users WHERE id = ${session.user.id}
  `;

  const isSuperAdmin =
    userData?.role === "super_admin" || userData?.role === "admin";

  if (!isSuperAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Check if new slug is already taken (by another project)
  if (slug !== projectSlug) {
    const [existing] = await sql`
      SELECT id FROM projects WHERE slug = ${slug} AND id != ${project.id}
    `;

    if (existing) {
      return Response.json(
        { error: "A project with this slug already exists" },
        { status: 409 }
      );
    }
  }

  // Update project
  await sql`
    UPDATE projects
    SET name = ${name},
        slug = ${slug},
        metadata = ${metadata ? sql.json(metadata) : sql.json({})},
        updated_at = NOW()
    WHERE id = ${project.id}
  `;

  return Response.json({ success: true, slug });
}

/**
 * Delete project and all associated data
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
  const sql = getDb();

  // Get project
  const [project] = await sql`
    SELECT id FROM projects WHERE slug = ${projectSlug}
  `;

  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  // Check if user is super admin
  const [userData] = await sql`
    SELECT role FROM users WHERE id = ${session.user.id}
  `;

  const isSuperAdmin =
    userData?.role === "super_admin" || userData?.role === "admin";

  if (!isSuperAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Delete all associated data (CASCADE should handle this, but being explicit)
 await sql.begin(async (tx) => {
   await tx.unsafe(`DELETE FROM documents WHERE project_id = $1`, [project.id]);
   await tx.unsafe(`DELETE FROM navigation WHERE project_id = $1`, [
     project.id,
   ]);
   await tx.unsafe(`DELETE FROM project_members WHERE project_id = $1`, [
     project.id,
   ]);
   await tx.unsafe(`DELETE FROM projects WHERE id = $1`, [project.id]);
 });

  return Response.json({ success: true });
}
