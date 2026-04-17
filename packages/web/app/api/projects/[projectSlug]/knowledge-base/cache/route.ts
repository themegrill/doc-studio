import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/postgres";
import { invalidateKbCache } from "@/lib/kb-cache";

/**
 * DELETE /api/projects/[projectSlug]/knowledge-base/cache
 *
 * Clears the server-side in-memory KB prompt cache for this project so the
 * next chat request reloads from the database and Anthropic's prompt cache
 * is effectively busted (the new prompt text won't match the cached prefix).
 *
 * Admin/super-admin only.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  const [userData] = await sql<{ role: string }[]>`
    SELECT role FROM users WHERE id = ${session.user.id}
  `;
  if (!userData || !["admin", "super_admin"].includes(userData.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { projectSlug } = await params;

  invalidateKbCache(projectSlug);

  return NextResponse.json({ success: true });
}
