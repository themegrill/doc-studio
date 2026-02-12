import { ContentManager } from "@/lib/db/ContentManager";
import DocsLayoutClient from "@/components/docs/DocsLayoutClient";
import { getDb } from "@/lib/db/postgres";
import { auth } from "@/lib/auth";
import { notFound } from "next/navigation";

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
    SELECT id, name, slug FROM projects WHERE slug = ${projectSlug}
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

  return (
    <DocsLayoutClient navigation={navigation} userProjectRole={userRole}>
      {children}
    </DocsLayoutClient>
  );
}
