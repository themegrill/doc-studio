import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/postgres";
import { NextRequest } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> }
) {
  const { projectSlug } = await params;
  const sql = getDb();

  const [project] = await sql`
    SELECT redirects FROM projects WHERE slug = ${projectSlug} LIMIT 1
  `;

  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  return Response.json({ redirects: project.redirects ?? [] });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectSlug } = await params;
  const { redirects } = await request.json();

  if (!Array.isArray(redirects)) {
    return Response.json({ error: "redirects must be an array" }, { status: 400 });
  }

  // Validate each entry
  for (let i = 0; i < redirects.length; i++) {
    const r = redirects[i];
    if (typeof r?.from !== "string" || !r.from.startsWith("/")) {
      return Response.json(
        { error: `Entry ${i + 1}: "from" must be a string starting with "/"` },
        { status: 400 }
      );
    }
    if (typeof r?.to !== "string" || !r.to.startsWith("/")) {
      return Response.json(
        { error: `Entry ${i + 1}: "to" must be a string starting with "/"` },
        { status: 400 }
      );
    }
  }

  // Normalize "from": strip any #hash or ?query so stored paths are always clean pathnames.
  // Deduplicate by normalized "from" — last write wins.
  const seen = new Map<string, string>();
  for (const r of redirects) {
    const from = r.from.trim().split("?")[0].split("#")[0];
    seen.set(from, r.to.trim());
  }
  const deduped = Array.from(seen.entries()).map(([from, to]) => ({ from, to }));

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

  await sql`
    UPDATE projects
    SET redirects = ${sql.json(deduped)}, updated_at = NOW()
    WHERE id = ${project.id}
  `;

  return Response.json({ success: true, count: deduped.length });
}
