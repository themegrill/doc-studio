import { ContentManager } from "@/lib/db/ContentManager";
import DocsLayoutClient from "@/components/docs/DocsLayoutClient";
import { getDb } from "@/lib/db/postgres";
import { auth } from "@/lib/auth";
import { notFound } from "next/navigation";
import type { NavRoute } from "@/lib/db/ContentManager";

export default async function ProjectDocsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectSlug: string }>;
}) {
  const { projectSlug } = await params;
  const session = await auth();

  // Get project from slug
  const sql = getDb();
  const [project] = await sql`
  SELECT id, name, slug, settings AS metadata
  FROM projects
  WHERE slug = ${projectSlug}
`;

  if (!project) {
    notFound();
  }

  // Get user's role in this project if authenticated
  let userRole = null;
  if (session?.user?.id) {
    // Check if user is system admin
    const [userData] = await sql`
      SELECT role FROM users WHERE id = ${session.user.id}
    `;

    const isSuperAdmin = userData?.role === "super_admin" || userData?.role === "admin";

    if (isSuperAdmin) {
      // Super admins get owner role for all projects
      userRole = "owner";
    } else {
      // Regular users get their project role
      const [membership] = await sql`
        SELECT role FROM project_members
        WHERE project_id = ${project.id} AND user_id = ${session.user.id}
      `;
      userRole = membership?.role || null;
    }
  }

  const cm = ContentManager.create();
  const navigation = await cm.getNavigation(project.id);

  // Build the set of slugs to hide from the sidebar. Trashed documents keep
  // their navigation entry (so they can be restored) but must never appear in
  // the sidebar for anyone. Draft documents are additionally hidden from
  // unauthenticated visitors.
  const hiddenSlugs = new Set<string>();

  const trashedDocs = await sql`
    SELECT slug FROM documents
    WHERE project_id = ${project.id} AND deleted_at IS NOT NULL
  `;
  (trashedDocs as unknown as { slug: string }[]).forEach((d) => hiddenSlugs.add(d.slug));

  if (!session?.user) {
    const draftDocs = await sql`
      SELECT slug FROM documents
      WHERE project_id = ${project.id} AND published = false AND deleted_at IS NULL
    `;
    (draftDocs as unknown as { slug: string }[]).forEach((d) => hiddenSlugs.add(d.slug));
  }

  let filteredNavigation = navigation;
  if (hiddenSlugs.size > 0) {
    const filterRoutes = (routes: NavRoute[]): NavRoute[] =>
      routes
        .filter((route) => {
          const slug = route.slug || route.path?.replace(/^\/docs\//, "");
          return !slug || !hiddenSlugs.has(slug);
        })
        .map((route) => ({
          ...route,
          children: route.children ? filterRoutes(route.children) : undefined,
        }));

    filteredNavigation = { ...navigation, routes: filterRoutes(navigation.routes) };
  }

  return (
    <DocsLayoutClient
      navigation={filteredNavigation}
      userProjectRole={userRole}
      projectMetadata={project.metadata || {}}
    >
      {children}
    </DocsLayoutClient>
  );
}

export const dynamic = "force-dynamic";
