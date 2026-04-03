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

  // Filter out draft (unpublished) documents — public clients must not see drafts
  const publishedDocs = await sql`
    SELECT slug FROM documents
    WHERE project_id = ${project.id} AND published = true
  `;
  const publishedSlugs = new Set(publishedDocs.map((d) => d.slug as string));

  nav.routes = nav.routes
    .map((route) => {
      if (route.children && route.children.length > 0) {
        return {
          ...route,
          children: route.children.filter((child) => {
            const slug = child.path?.replace(/^\/docs\//, "") ?? child.slug ?? "";
            return !slug || publishedSlugs.has(slug);
          }),
        };
      }
      return route;
    })
    .filter((route) => {
      if (!route.children || route.children.length === 0) {
        const slug = route.path?.replace(/^\/docs\//, "") ?? route.slug ?? "";
        return !slug || publishedSlugs.has(slug);
      }
      return true;
    });

  return NextResponse.json(nav);
}
