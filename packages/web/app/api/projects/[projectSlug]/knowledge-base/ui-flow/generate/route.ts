import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/postgres";
import { getAIConfig } from "@/lib/ai-config";
import { list } from "@vercel/blob";
import {
  extractSingleImage,
  mergeScreens,
  type UiFlowScreen,
  type UiFlowKnowledgeBase,
} from "@/lib/ui-flow-extractor";

export const maxDuration = 60;

const DEBOUNCE_MS = 5_000;
const VALID_MIME_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;

type JSONValue = string | number | boolean | null | JSONValue[] | { [k: string]: JSONValue };
function toJSON(v: unknown): JSONValue {
  return JSON.parse(JSON.stringify(v)) as JSONValue;
}
function asJson<T>(v: T) {
  return v as unknown as Parameters<ReturnType<typeof import("@/lib/db/postgres").getDb>["json"]>[0];
}

interface PendingBlob { url: string; filename: string; mimeType: string }

interface JobMetadata {
  _jobStatus: "processing" | "done" | "error";
  _pendingBlobs: PendingBlob[];
  _processed: number;
  _total: number;
  _failures: Array<{ filename: string; error: string }>;
  imageCount?: number;
}

// ── Auth + project helper ─────────────────────────────────────────────────────

async function resolveProject(projectSlug: string) {
  const sql = getDb();
  const [project] = await sql<{ id: string; name: string }[]>`
    SELECT id, name FROM projects WHERE slug = ${projectSlug}
  `;
  return { sql, project: project ?? null };
}

async function checkAuth() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const sql = getDb();
  const [userData] = await sql<{ role: string }[]>`SELECT role FROM users WHERE id = ${session.user.id}`;
  if (!userData || !["admin", "super_admin"].includes(userData.role)) return null;
  return session;
}

// ── POST — start job ──────────────────────────────────────────────────────────

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> }
) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectSlug } = await params;
  const { sql, project } = await resolveProject(projectSlug);
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

  // Resolve mime types from blob metadata (no image download yet)
  const pendingBlobs: PendingBlob[] = blobs.map((blob) => {
    const filename = blob.pathname.split("/").pop() ?? "image.png";
    const ext = filename.split(".").pop()?.toLowerCase() ?? "png";
    const mimeType = ext === "jpg" ? "image/jpeg" : ext === "png" ? "image/png" : "image/jpeg";
    return { url: blob.url, filename, mimeType };
  });

  const metadata: JobMetadata = {
    _jobStatus: "processing",
    _pendingBlobs: pendingBlobs,
    _processed: 0,
    _total: pendingBlobs.length,
    _failures: [],
  };

  const emptyKb: UiFlowKnowledgeBase = {
    project: { name: project.name },
    screens: [],
    flows: [],
    components: [],
    open_questions: [],
  };

  await sql`
    INSERT INTO project_knowledge_bases (project_id, type, content, metadata)
    VALUES (
      ${project.id}, 'ui_flow',
      ${sql.json(asJson(toJSON(emptyKb)))},
      ${sql.json(asJson(toJSON(metadata)))}
    )
    ON CONFLICT (project_id, type) DO UPDATE SET
      content    = EXCLUDED.content,
      metadata   = EXCLUDED.metadata,
      updated_at = NOW()
  `;

  return NextResponse.json({ status: "processing", total: pendingBlobs.length, processed: 0 });
}

// ── GET — poll: process one image ─────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> }
) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectSlug } = await params;
  const { sql, project } = await resolveProject(projectSlug);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const [row] = await sql<{ content: UiFlowKnowledgeBase; metadata: JobMetadata; updated_at: string }[]>`
    SELECT content, metadata, updated_at
    FROM project_knowledge_bases
    WHERE project_id = ${project.id} AND type = 'ui_flow'
  `;

  if (!row) return NextResponse.json({ status: "idle" });

  const meta = row.metadata;

  if (meta._jobStatus === "done") {
    return NextResponse.json({ status: "done", processed: meta._processed, total: meta._total, failures: meta._failures });
  }
  if (meta._jobStatus === "error") {
    return NextResponse.json({ status: "error", processed: meta._processed, total: meta._total });
  }

  // Debounce: another request is already working
  const msSinceUpdate = Date.now() - new Date(row.updated_at).getTime();
  if (msSinceUpdate < DEBOUNCE_MS) {
    return NextResponse.json({ status: "processing", processed: meta._processed, total: meta._total });
  }

  // Claim the lock
  await sql`UPDATE project_knowledge_bases SET updated_at = NOW()
            WHERE project_id = ${project.id} AND type = 'ui_flow'`;

  if (meta._pendingBlobs.length === 0) {
    // Nothing left — finalize (shouldn't normally reach here but handle gracefully)
    await finalize(sql, project.id, row.content, meta);
    return NextResponse.json({ status: "done", processed: meta._processed, total: meta._total, failures: meta._failures });
  }

  // Pop the first pending blob
  const [next, ...remaining] = meta._pendingBlobs;

  const config = await getAIConfig();
  const apiKey = (config.apiKey || process.env.ANTHROPIC_API_KEY) ?? "";
  const model = config.defaultModel || "claude-sonnet-4-6";

  // Fetch + process single image
  let screen: UiFlowScreen | null = null;
  let failure: { filename: string; error: string } | null = null;

  try {
    const res = await fetch(next.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    const rawMime = (res.headers.get("content-type") || "image/png").split(";")[0].trim();
    const mimeType = rawMime === "image/jpg" ? "image/jpeg"
      : VALID_MIME_TYPES.includes(rawMime as typeof VALID_MIME_TYPES[number]) ? rawMime : "image/png";

    const result = await extractSingleImage({ filename: next.filename, data: buffer, mimeType }, apiKey, model);
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
    // All images processed — build final KB
    const finalKb = mergeScreens(project.name, updatedScreens);
    updatedMeta._jobStatus = "done";
    updatedMeta.imageCount = updatedMeta._total;
    await finalize(sql, project.id, finalKb, updatedMeta);
    return NextResponse.json({
      status: "done",
      processed: updatedMeta._processed,
      total: updatedMeta._total,
      failures: updatedMeta._failures,
    });
  }

  // More images remain — save progress
  const partialKb: UiFlowKnowledgeBase = { ...row.content, screens: updatedScreens };
  await sql`
    UPDATE project_knowledge_bases SET
      content    = ${sql.json(asJson(toJSON(partialKb)))},
      metadata   = ${sql.json(asJson(toJSON(updatedMeta)))},
      updated_at = NOW()
    WHERE project_id = ${project.id} AND type = 'ui_flow'
  `;

  return NextResponse.json({
    status: "processing",
    processed: updatedMeta._processed,
    total: updatedMeta._total,
  });
}

async function finalize(
  sql: ReturnType<typeof getDb>,
  projectId: string,
  kb: UiFlowKnowledgeBase,
  meta: JobMetadata
) {
  await sql`
    UPDATE project_knowledge_bases SET
      content    = ${sql.json(asJson(toJSON(kb)))},
      metadata   = ${sql.json(asJson(toJSON({ imageCount: meta._total, summary: { processed: meta._total, succeeded: meta._processed - meta._failures.length, failed: meta._failures.length } })))},
      updated_at = NOW()
    WHERE project_id = ${projectId} AND type = 'ui_flow'
  `;
}
