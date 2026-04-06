import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/postgres";
import { auth } from "@/lib/auth";

/**
 * POST /api/projects/[projectSlug]/knowledge-base/upload
 *
 * Saves an uploaded knowledge base JSON into project_knowledge_bases
 * with type='upload'. The parsed JSON content is sent in the request body
 * as { content: {...} }.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();

  const [userData] = await sql`
    SELECT role FROM users WHERE id = ${session.user.id}
  `;
  const isSuperAdmin =
    userData?.role === "super_admin" || userData?.role === "admin";
  if (!isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { projectSlug } = await params;

  const [project] = await sql`
    SELECT id FROM projects WHERE slug = ${projectSlug}
  `;
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  let content: unknown;
  try {
    const body = await request.json();
    content = body?.content;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!content || typeof content !== "object") {
    return NextResponse.json(
      { error: "content must be a non-null JSON object" },
      { status: 400 }
    );
  }

  await sql`
    INSERT INTO project_knowledge_bases (project_id, type, content, metadata)
    VALUES (
      ${project.id},
      'upload',
      ${sql.json(content as Record<string, unknown>)},
      ${sql.json({})}
    )
    ON CONFLICT (project_id, type)
    DO UPDATE SET
      content    = EXCLUDED.content,
      updated_at = NOW()
  `;

  return NextResponse.json({ success: true });
}
