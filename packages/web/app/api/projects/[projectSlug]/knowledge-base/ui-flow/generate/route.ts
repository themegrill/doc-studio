import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const maxDuration = 60;
import { getDb } from "@/lib/db/postgres";
import { getAIConfig } from "@/lib/ai-config";
import { list } from "@vercel/blob";
import { runUiFlowExtraction, type ImageBuffer } from "@/lib/ui-flow-extractor";

type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | { [k: string]: JSONValue };

function toJSON(v: unknown): JSONValue {
  return JSON.parse(JSON.stringify(v)) as JSONValue;
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  const [userData] =
    await sql`SELECT role FROM users WHERE id = ${session.user.id}`;
  if (!userData || !["admin", "super_admin"].includes(userData.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { projectSlug } = await params;
  const [project] =
    await sql`SELECT id, name FROM projects WHERE slug = ${projectSlug}`;
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { blobs } = await list({ prefix: `ui-flow-images/${projectSlug}/` });
  if (blobs.length === 0) {
    return NextResponse.json(
      { error: "No UI flow images found. Please upload images first." },
      { status: 400 }
    );
  }

  const config = await getAIConfig();
  const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI API key is not configured" },
      { status: 503 }
    );
  }

  // Fetch image data from Vercel Blob
  const images: ImageBuffer[] = [];
  for (const blob of blobs) {
    try {
      const res = await fetch(blob.url);
      if (!res.ok) continue;

      const buffer = Buffer.from(await res.arrayBuffer());
      const filename = blob.pathname.split("/").pop() ?? "image.png";
      const rawMime = (res.headers.get("content-type") || "image/png").split(";")[0].trim();
      // Normalize to types accepted by the Anthropic API
      const mimeType =
        rawMime === "image/jpg" ? "image/jpeg" :
        ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(rawMime)
          ? rawMime
          : "image/png";

      images.push({ filename, data: buffer, mimeType });
    } catch {
      // Skip blobs that can't be fetched
    }
  }

  if (images.length === 0) {
    return NextResponse.json(
      { error: "Could not load any images. Please re-upload your images." },
      { status: 400 }
    );
  }

  let result;
  try {
    result = await runUiFlowExtraction({
      images,
      projectName: project.name as string,
      apiKey,
      model: config.defaultModel || "claude-sonnet-4-6",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Extraction failed" },
      { status: 500 }
    );
  }

  if (result.knowledgebase.screens.length === 0) {
    return NextResponse.json(
      {
        error: "No screens could be extracted from the provided images.",
        failures: result.failures,
        summary: result.summary,
      },
      { status: 422 }
    );
  }

  const content = toJSON(result.knowledgebase);
  const metadata = toJSON({
    summary: result.summary,
    imageCount: result.summary.processed,
  });

  await sql`
    INSERT INTO project_knowledge_bases (project_id, type, content, metadata)
    VALUES (
      ${project.id},
      'ui_flow',
      ${sql.json(content as Parameters<typeof sql.json>[0])},
      ${sql.json(metadata as Parameters<typeof sql.json>[0])}
    )
    ON CONFLICT (project_id, type)
    DO UPDATE SET
      content    = EXCLUDED.content,
      metadata   = EXCLUDED.metadata,
      updated_at = NOW()
  `;

  return NextResponse.json({
    success: true,
    summary: result.summary,
    failures: result.failures,
  });
}
