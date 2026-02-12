import { getDb } from "@/lib/db/postgres";
import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

// GET /api/projects/[projectSlug]/members - List project members
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> }
) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  const { projectSlug } = await params;

  try {
    // Get project ID from slug
    const [project] = await sql`
      SELECT id FROM projects WHERE slug = ${projectSlug}
    `;

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const members = await sql`
      SELECT
        pm.id,
        pm.role,
        pm.created_at,
        u.id as user_id,
        u.email,
        u.name,
        u.image
      FROM project_members pm
      JOIN users u ON pm.user_id = u.id
      WHERE pm.project_id = ${project.id}
      ORDER BY
        CASE pm.role
          WHEN 'owner' THEN 1
          WHEN 'admin' THEN 2
          WHEN 'editor' THEN 3
          WHEN 'viewer' THEN 4
          ELSE 5
        END,
        pm.created_at ASC
    `;

    return NextResponse.json(members);
  } catch (error) {
    console.error("Error fetching project members:", error);
    return NextResponse.json(
      { error: "Failed to fetch members" },
      { status: 500 }
    );
  }
}

// POST /api/projects/[projectSlug]/members - Add member to project
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> }
) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  const { projectSlug } = await params;

  try {
    console.log("Adding member to project:", projectSlug);

    // Get project ID from slug
    const [project] = await sql`
      SELECT id FROM projects WHERE slug = ${projectSlug}
    `;

    if (!project) {
      console.error("Project not found:", projectSlug);
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    console.log("Project found:", project.id);

    const body = await req.json();
    const { userId, role } = body;

    console.log("Adding member:", { userId, role });

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    // Validate role
    const validRoles = ["owner", "admin", "editor", "viewer"];
    if (!role || !validRoles.includes(role)) {
      return NextResponse.json(
        { error: "Valid role is required (owner, admin, editor, viewer)" },
        { status: 400 }
      );
    }

    // Check if user exists
    const [user] = await sql`
      SELECT id FROM users WHERE id = ${userId}
    `;

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check if user is already a member
    const [existing] = await sql`
      SELECT id FROM project_members
      WHERE project_id = ${project.id} AND user_id = ${userId}
    `;

    if (existing) {
      return NextResponse.json(
        { error: "User is already a member of this project" },
        { status: 409 }
      );
    }

    // Add member
    const [member] = await sql`
      INSERT INTO project_members (project_id, user_id, role)
      VALUES (${project.id}, ${userId}, ${role})
      RETURNING id, project_id, user_id, role, created_at
    `;

    console.log("Member added successfully:", member.id);
    return NextResponse.json(member, { status: 201 });
  } catch (error: any) {
    console.error("Error adding project member:", error);
    return NextResponse.json(
      { error: error.message || "Failed to add member" },
      { status: 500 }
    );
  }
}
