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

  // Filter out draft (unpublished) and trashed documents — public clients
  // must not see drafts or documents that have been moved to the trash
  const publishedDocs = await sql`
    SELECT slug FROM documents
    WHERE project_id = ${project.id} AND published = true AND deleted_at IS NULL
  `;
  const publishedSlugs = new Set(publishedDocs.map((d) => d.slug as string));

  // Track which routes are sections (they originally had children), so a section
  // can be judged differently from a standalone document below.
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
      const slug = route.path?.replace(/^\/docs\//, "") ?? route.slug ?? "";

      if (sectionIds.has(routeKey)) {
        // A section is only worth showing if a visitor can actually reach
        // something through it. Sections used to be kept unconditionally, so a
        // section whose documents were all still drafts appeared on the public
        // site as an empty, dead entry.
        //
        // `route.children` has already been narrowed to published documents
        // above, so a non-empty list means there is something to click.
        const hasPublishedChild = (route.children ?? []).length > 0;
        const hasPublishedOverview = !!slug && publishedSlugs.has(slug);
        return hasPublishedChild || hasPublishedOverview;
      }

      // Standalone top-level document routes: only show if published
      return !slug || publishedSlugs.has(slug);
    });

  return NextResponse.json(nav);
}
