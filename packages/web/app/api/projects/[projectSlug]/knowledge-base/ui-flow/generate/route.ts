import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/postgres";
import { getAIConfig } from "@/lib/ai-config";
import { list } from "@vercel/blob";
import { invalidateKbCache } from "@/lib/kb-cache";
import {
  extractSingleImage,
  mergeScreens,
  type UiFlowScreen,
  type UiFlowKnowledgeBase,
} from "@/lib/ui-flow-extractor";

export const maxDuration = 60;

const DEBOUNCE_MS = 5_000;
const VALID_MIME_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

type SqlJsonInput = Parameters<ReturnType<typeof getDb>["json"]>[0];
function asJson<T>(value: T): SqlJsonInput {
  return value as unknown as SqlJsonInput;
}

interface PendingBlob { url: string; filename: string }

interface JobMetadata {
  _jobStatus: "processing" | "done" | "error";
  _pendingBlobs: PendingBlob[];
  _processed: number;
  _total: number;
  _failures: Array<{ filename: string; error: string }>;
}

// ── POST — start job ──────────────────────────────────────────────────────────

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  const [userData] = await sql<{ role: string }[]>`SELECT role FROM users WHERE id = ${session.user.id}`;
  if (!userData || !["admin", "super_admin"].includes(userData.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { projectSlug } = await params;
  const [project] = await sql<{ id: string; name: string }[]>`
    SELECT id, name FROM projects WHERE slug = ${projectSlug}
  `;
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const config = await getAIConfig();
  if (!config.apiKey && !process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "AI API key is not configured" }, { status: 503 });
  }

  const { blobs } = await list({ prefix: `ui-flow-images/${projectSlug}/` });
  if (blobs.length === 0) {
    return NextResponse.json(
      { error: "No UI flow images found. Please upload images first." },
      { status: 400 }
    );
  }

  const pendingBlobs: PendingBlob[] = blobs.map((blob) => ({
    url: blob.url,
    filename: blob.pathname.split("/").pop() ?? "image.png",
  }));

  const metadata: JobMetadata = {
    _jobStatus: "processing",
    _pendingBlobs: pendingBlobs,
    _processed: 0,
    _total: pendingBlobs.length,
    _failures: [],
  };

  const emptyKb: UiFlowKnowledgeBase = {
    project: { name: project.name as string },
    screens: [],
    flows: [],
    components: [],
    open_questions: [],
  };

  await sql`
    INSERT INTO project_knowledge_bases (project_id, type, content, metadata)
    VALUES (
      ${project.id}, 'ui_flow',
      ${sql.json(asJson(emptyKb))},
      ${sql.json(asJson(metadata))}
    )
    ON CONFLICT (project_id, type) DO UPDATE SET
      content    = EXCLUDED.content,
      metadata   = EXCLUDED.metadata,
      updated_at = NOW()
  `;

  return NextResponse.json({ status: "processing", total: pendingBlobs.length, processed: 0 });
}

// ── GET — poll: process one image per call ────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  const [userData] = await sql<{ role: string }[]>`SELECT role FROM users WHERE id = ${session.user.id}`;
  if (!userData || !["admin", "super_admin"].includes(userData.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { projectSlug } = await params;
  const [project] = await sql<{ id: string; name: string }[]>`
    SELECT id, name FROM projects WHERE slug = ${projectSlug}
  `;
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const [row] = await sql<{
    content: UiFlowKnowledgeBase;
    metadata: JobMetadata;
    updated_at: string;
  }[]>`
    SELECT content, metadata, updated_at
    FROM project_knowledge_bases
    WHERE project_id = ${project.id} AND type = 'ui_flow'
  `;

  if (!row) return NextResponse.json({ status: "idle" });

  const meta = row.metadata;

  if (meta._jobStatus === "done") {
    return NextResponse.json({
      status: "done",
      processed: meta._processed,
      total: meta._total,
      failures: meta._failures,
    });
  }

  // Debounce: skip if another poll is already working
  const msSinceUpdate = Date.now() - new Date(row.updated_at).getTime();
  if (msSinceUpdate < DEBOUNCE_MS) {
    return NextResponse.json({ status: "processing", processed: meta._processed, total: meta._total });
  }

  // Claim the lock immediately
  await sql`
    UPDATE project_knowledge_bases SET updated_at = NOW()
    WHERE project_id = ${project.id} AND type = 'ui_flow'
  `;

  if (meta._pendingBlobs.length === 0) {
    // Already done — finalize
    const finalKb = mergeScreens(project.name as string, row.content.screens ?? []);
    await saveResult(sql, project.id, projectSlug, finalKb, meta);
    return NextResponse.json({ status: "done", processed: meta._processed, total: meta._total, failures: meta._failures });
  }

  const config = await getAIConfig();
  const apiKey = (config.apiKey || process.env.ANTHROPIC_API_KEY) ?? "";
  const model = config.defaultModel || "claude-sonnet-4-6";

  const [next, ...remaining] = meta._pendingBlobs;

  // Fetch + normalize mime type
  let screen: UiFlowScreen | null = null;
  let failure: { filename: string; error: string } | null = null;

  try {
    const fetchRes = await fetch(next.url);
    if (!fetchRes.ok) throw new Error(`Blob fetch failed: HTTP ${fetchRes.status}`);
    const buffer = Buffer.from(await fetchRes.arrayBuffer());
    const rawMime = (fetchRes.headers.get("content-type") || "image/png").split(";")[0].trim();
    const mimeType =
      rawMime === "image/jpg" ? "image/jpeg"
      : VALID_MIME_TYPES.includes(rawMime) ? rawMime
      : "image/png";

    const result = await extractSingleImage(
      { filename: next.filename, data: buffer, mimeType },
      apiKey,
      model
    );
    if (result.ok) screen = result.screen;
    else failure = { filename: next.filename, error: result.error };
  } catch (err) {
    failure = { filename: next.filename, error: err instanceof Error ? err.message : String(err) };
  }

  const updatedScreens: UiFlowScreen[] = screen
    ? [...(row.content.screens ?? []), screen]
    : (row.content.screens ?? []);

  const updatedMeta: JobMetadata = {
    ...meta,
    _pendingBlobs: remaining,
    _processed: meta._processed + 1,
    _failures: failure ? [...meta._failures, failure] : meta._failures,
  };

  if (remaining.length === 0) {
    const finalKb = mergeScreens(project.name as string, updatedScreens);
    updatedMeta._jobStatus = "done";
    await saveResult(sql, project.id, projectSlug, finalKb, updatedMeta);
    return NextResponse.json({
      status: "done",
      processed: updatedMeta._processed,
      total: updatedMeta._total,
      failures: updatedMeta._failures,
    });
  }

  // Save incremental progress
  const partialKb: UiFlowKnowledgeBase = { ...row.content, screens: updatedScreens };
  await sql`
    UPDATE project_knowledge_bases SET
      content    = ${sql.json(asJson(partialKb))},
      metadata   = ${sql.json(asJson(updatedMeta))},
      updated_at = NOW()
    WHERE project_id = ${project.id} AND type = 'ui_flow'
  `;

  return NextResponse.json({ status: "processing", processed: updatedMeta._processed, total: updatedMeta._total });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function saveResult(
  sql: ReturnType<typeof getDb>,
  projectId: string,
  projectSlug: string,
  kb: UiFlowKnowledgeBase,
  meta: JobMetadata
) {
  const finalMeta = {
    imageCount: meta._total,
    summary: {
      processed: meta._total,
      succeeded: meta._processed - meta._failures.length,
      failed: meta._failures.length,
    },
  };
  await sql`
    UPDATE project_knowledge_bases SET
      content    = ${sql.json(asJson(kb))},
      metadata   = ${sql.json(asJson(finalMeta))},
      updated_at = NOW()
    WHERE project_id = ${projectId} AND type = 'ui_flow'
  `;

  // Invalidate the server-side KB prompt cache so the next chat request
  // fetches the newly generated UI flow knowledge base from the database.
  invalidateKbCache(projectSlug);
}
