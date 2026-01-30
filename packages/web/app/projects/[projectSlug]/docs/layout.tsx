import { ContentManager } from "@/lib/db/ContentManager";
import DocsLayoutClient from "@/components/docs/DocsLayoutClient";
import { getDb } from "@/lib/db/postgres";
import { notFound } from "next/navigation";

export default async function ProjectDocsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectSlug: string }>;
}) {
  const { projectSlug } = await params;

  // Get project from slug
  const sql = getDb();
  const [project] = await sql`
    SELECT id, name, slug FROM projects WHERE slug = ${projectSlug}
  `;

  if (!project) {
    notFound();
  }

  const cm = ContentManager.create();
  const navigation = await cm.getNavigation(project.id);

  return <DocsLayoutClient navigation={navigation}>{children}</DocsLayoutClient>;
}
