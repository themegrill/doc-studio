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

  // Track which routes are sections (originally had children) so they stay visible
  // even when all their child documents are unpublished
  const sectionIds = new Set(
    nav.routes
      .filter((route) => route.children && route.children.length > 0)
      .map((route) => route.id ?? route.path ?? route.title)
  );

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
      const routeKey = route.id ?? route.path ?? route.title;
      // Sections (originally had children) are always visible even if all docs are unpublished
      if (sectionIds.has(routeKey)) return true;
      // Standalone top-level document routes: only show if published
      const slug = route.path?.replace(/^\/docs\//, "") ?? route.slug ?? "";
      return !slug || publishedSlugs.has(slug);
    });

  return NextResponse.json(nav);
}
