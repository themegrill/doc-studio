import { getDb } from "@/lib/db/postgres";
import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

// PATCH /api/projects/[projectSlug]/members/[memberId] - Update member role
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectSlug: string; memberId: string }> }
) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  const { projectSlug, memberId } = await params;

  try {
    // Get project ID from slug
    const [project] = await sql`
      SELECT id FROM projects WHERE slug = ${projectSlug}
    `;

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const body = await req.json();
    const { role } = body;

    // Validate role
    const validRoles = ["owner", "admin", "editor", "viewer"];
    if (!role || !validRoles.includes(role)) {
      return NextResponse.json(
        { error: "Valid role is required (owner, admin, editor, viewer)" },
        { status: 400 }
      );
    }

    // Check if member exists
    const [existing] = await sql`
      SELECT id FROM project_members
      WHERE id = ${memberId} AND project_id = ${project.id}
    `;

    if (!existing) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    // Update role
    const [updated] = await sql`
      UPDATE project_members
      SET role = ${role}
      WHERE id = ${memberId}
      RETURNING id, project_id, user_id, role, created_at
    `;

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating project member:", error);
    return NextResponse.json(
      { error: "Failed to update member" },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/[projectSlug]/members/[memberId] - Remove member
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectSlug: string; memberId: string }> }
) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  const { projectSlug, memberId } = await params;

  try {
    // Get project ID from slug
    const [project] = await sql`
      SELECT id FROM projects WHERE slug = ${projectSlug}
    `;

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Check if member exists
    const [existing] = await sql`
      SELECT id, user_id FROM project_members
      WHERE id = ${memberId} AND project_id = ${project.id}
    `;

    if (!existing) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    // Prevent removing yourself if you're the only owner
    const owners = await sql`
      SELECT COUNT(*) as count FROM project_members
      WHERE project_id = ${project.id} AND role = 'owner'
    `;

    if (existing.user_id === session.user.id && owners[0].count <= 1) {
      return NextResponse.json(
        { error: "Cannot remove the last owner. Transfer ownership first." },
        { status: 400 }
      );
    }

    // Remove member
    await sql`
      DELETE FROM project_members WHERE id = ${memberId}
    `;

    return NextResponse.json({ success: true, message: "Member removed" });
  } catch (error) {
    console.error("Error removing project member:", error);
    return NextResponse.json(
      { error: "Failed to remove member" },
      { status: 500 }
    );
  }
}
