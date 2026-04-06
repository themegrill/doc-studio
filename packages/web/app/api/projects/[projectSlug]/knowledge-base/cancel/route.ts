import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/postgres";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> }
) {
  const { projectSlug } = await params;
  const sql = getDb();

  const [session] = await sql<{ status: string }[]>`
    SELECT status FROM crawl_sessions WHERE project_slug = ${projectSlug}
  `;

  if (!session) {
    return NextResponse.json({ error: "No running crawl found" }, { status: 404 });
  }

  if (["done", "error", "cancelled"].includes(session.status)) {
    return NextResponse.json({ error: "No active crawl to cancel" }, { status: 400 });
  }

  await sql`
    UPDATE crawl_sessions SET
      status       = 'cancelled',
      message      = 'Crawl cancelled by user.',
      error        = 'Cancelled',
      completed_at = NOW(),
      updated_at   = NOW()
    WHERE project_slug = ${projectSlug}
  `;

  return NextResponse.json({ message: "Crawl cancelled" });
}
