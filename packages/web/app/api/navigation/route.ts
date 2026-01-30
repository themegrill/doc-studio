import { NextResponse } from "next/server";
import { ContentManager } from "@/lib/db/ContentManager";
import { getDb } from "@/lib/db/postgres";

export async function GET() {
  // TODO: Get project from request/headers
  const sql = getDb();
  const [project] = await sql`SELECT id FROM projects WHERE slug = 'default'`;

  const cm = ContentManager.create();
  const nav = await cm.getNavigation(project.id);
  return NextResponse.json(nav);
}
