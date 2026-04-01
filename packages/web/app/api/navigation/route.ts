import { NextRequest, NextResponse } from "next/server";
import { ContentManager } from "@/lib/db/ContentManager";
import { getDb } from "@/lib/db/postgres";

export async function GET(request: NextRequest) {
  const sql = getDb();
  const { searchParams } = new URL(request.url);
  const projectSlug = searchParams.get("projectSlug") || "default";

  const [project] = await sql`SELECT id FROM projects WHERE slug = ${projectSlug} LIMIT 1`;

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const cm = ContentManager.create();
  const nav = await cm.getNavigation(project.id);
  return NextResponse.json(nav);
}
