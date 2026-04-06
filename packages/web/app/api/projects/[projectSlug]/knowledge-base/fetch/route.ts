import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/postgres";
import { normalizeUrl } from "@/lib/crawl-engine";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> }
) {
  const { projectSlug } = await params;

  const body = await request.json();
  const { websiteUrl } = body;

  if (!websiteUrl) {
    return NextResponse.json({ error: "websiteUrl is required" }, { status: 400 });
  }

  const normalized = normalizeUrl(websiteUrl);
  if (!normalized) {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  const sql = getDb();

  await sql`
    INSERT INTO crawl_sessions (
      project_slug, start_url, status,
      queue_urls, visited_urls, raw_pages, refined_batches,
      visited_count, raw_pages_count,
      current_refine_batch, total_refine_batches,
      progress, message, error, started_at, updated_at, completed_at
    )
    VALUES (
      ${projectSlug}, ${normalized}, 'crawling',
      ${sql.json([normalized])}, ${sql.json([])}, ${sql.json([])}, ${sql.json([])},
      0, 0, 0, 0,
      0, 'Starting crawl...', null, NOW(), NOW(), null
    )
    ON CONFLICT (project_slug) DO UPDATE SET
      start_url             = EXCLUDED.start_url,
      status                = 'crawling',
      queue_urls            = EXCLUDED.queue_urls,
      visited_urls          = '[]',
      raw_pages             = '[]',
      refined_batches       = '[]',
      visited_count         = 0,
      raw_pages_count       = 0,
      current_refine_batch  = 0,
      total_refine_batches  = 0,
      progress              = 0,
      message               = 'Starting crawl...',
      error                 = null,
      started_at            = NOW(),
      updated_at            = NOW(),
      completed_at          = null
  `;

  return NextResponse.json({ message: "Knowledge base fetch started" }, { status: 200 });
}
