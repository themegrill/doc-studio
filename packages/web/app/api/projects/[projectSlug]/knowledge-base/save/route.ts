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

  const existingSettings =
    typeof project.settings === "string"
      ? JSON.parse(project.settings)
      : (project.settings || {});
  const updatedSettings = {
    ...existingSettings,
    knowledgeBase,
  };

  await sql`
    UPDATE projects
    SET settings = ${sql.json(updatedSettings)},
        updated_at = NOW()
    WHERE id = ${project.id}
  `;

  return NextResponse.json({ success: true });
}
