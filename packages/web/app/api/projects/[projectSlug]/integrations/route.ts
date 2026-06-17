import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/postgres";
import { NextRequest } from "next/server";

/** Public GET — returns integration config (no auth). Used by client app. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> }
) {
  const { projectSlug } = await params;
  const sql = getDb();

  const [project] = await sql`
    SELECT settings FROM projects WHERE slug = ${projectSlug} LIMIT 1
  `;

  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const integrations = project.settings?.integrations ?? {};
  return Response.json({ integrations });
}

/** Authenticated PUT — saves integrations block into settings JSONB. */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectSlug } = await params;
  const { integrations } = await request.json();

  if (!integrations || typeof integrations !== "object") {
    return Response.json({ error: "integrations must be an object" }, { status: 400 });
  }

  const sql = getDb();

  const [userData] = await sql`
    SELECT role FROM users WHERE id = ${session.user.id}
  `;
  const isSuperAdmin = userData?.role === "super_admin" || userData?.role === "admin";

  const [project] = await sql`
    SELECT id FROM projects WHERE slug = ${projectSlug} LIMIT 1
  `;
  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  if (!isSuperAdmin) {
    const [membership] = await sql`
      SELECT role FROM project_members
      WHERE project_id = ${project.id} AND user_id = ${session.user.id}
    `;
    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // Validate Crisp Website ID format — must be a standard UUID if provided
  const crispId = integrations.crispWebsiteId?.trim();
  if (crispId) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(crispId)) {
      return Response.json(
        { error: "Invalid Crisp Website ID — must be a UUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)." },
        { status: 422 }
      );
    }
  }

  // Merge integrations into existing settings to avoid clobbering deploy config etc.
  await sql`
    UPDATE projects
    SET settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object('integrations', ${sql.json(integrations)}::jsonb),
        updated_at = NOW()
    WHERE id = ${project.id}
  `;

  return Response.json({ success: true });
}
