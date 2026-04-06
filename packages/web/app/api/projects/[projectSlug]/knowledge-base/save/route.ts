import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/postgres";
import { auth } from "@/lib/auth";
import path from "path";
import fs from "fs";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectSlug } = await params;

  const kbPath = path.join(
    process.cwd(),
    "knowledge-base",
    projectSlug,
    "website-knowledge-base.json"
  );

  if (!fs.existsSync(kbPath)) {
    return NextResponse.json(
      { error: "Knowledge base file not found. Run the crawl first." },
      { status: 404 }
    );
  }

  let knowledgeBase: unknown;
  try {
    knowledgeBase = JSON.parse(fs.readFileSync(kbPath, "utf-8"));
  } catch {
    return NextResponse.json(
      { error: "Failed to read knowledge base file" },
      { status: 500 }
    );
  }

  const sql = getDb();

  const [project] = await sql`
    SELECT id, settings FROM projects WHERE slug = ${projectSlug}
  `;

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Resolve site URL from project settings for metadata
  const settings = safeSettingsObject(project.settings);
  const siteLink: string = typeof settings.siteLink === "string" ? settings.siteLink : "";

  // Save into the dedicated project_knowledge_bases table (type='website')
  await sql`
    INSERT INTO project_knowledge_bases (project_id, type, content, metadata)
    VALUES (
      ${project.id},
      'website',
      ${sql.json(knowledgeBase as Record<string, unknown>)},
      ${sql.json(siteLink ? { siteLink } : {})}
    )
    ON CONFLICT (project_id, type)
    DO UPDATE SET
      content    = EXCLUDED.content,
      metadata   = EXCLUDED.metadata,
      updated_at = NOW()
  `;

  return NextResponse.json({ success: true });
}

function safeSettingsObject(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  if (typeof raw !== "object" || Array.isArray(raw)) return {};
  const obj = raw as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length > 0 && keys.every((k) => /^\d+$/.test(k))) {
    try {
      const recovered = JSON.parse(
        keys.sort((a, b) => Number(a) - Number(b)).map((k) => obj[k]).join("")
      );
      if (recovered && typeof recovered === "object" && !Array.isArray(recovered)) {
        return recovered as Record<string, unknown>;
      }
    } catch { /* fall through */ }
    return {};
  }
  return obj;
}
