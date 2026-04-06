import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/postgres";
import { auth } from "@/lib/auth";

/**
 * GET /api/projects/[projectSlug]/knowledge-base/status
 *
 * Returns which KB types are saved for a project and their metadata.
 * Does NOT return the full content (can be large).
 *
 * Response shape:
 * {
 *   upload?:   { savedAt: string }
 *   website?:  { savedAt: string; metadata: { siteLink?: string } }
 *   codebase?: { savedAt: string; metadata: { githubRepo?: string; branch?: string; filePath?: string } }
 * }
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectSlug } = await params;
  const sql = getDb();

  const rows = await sql`
    SELECT pkb.type, pkb.metadata, pkb.updated_at
    FROM project_knowledge_bases pkb
    INNER JOIN projects p ON p.id = pkb.project_id
    WHERE p.slug = ${projectSlug}
  `;

  const result: Record<string, { savedAt: string; metadata: Record<string, unknown> }> = {};

  for (const row of rows) {
    result[row.type as string] = {
      savedAt: row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at),
      metadata: (typeof row.metadata === "string"
        ? JSON.parse(row.metadata)
        : row.metadata) as Record<string, unknown>,
    };
  }

  return NextResponse.json(result);
}
