import { ContentManager } from "@/lib/db/ContentManager";
import DocsLayoutClient from "@/components/docs/DocsLayoutClient";
import { headers } from "next/headers";
import { getProjectFromRequest } from "@/lib/project-helpers";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/postgres";

export default async function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cm = ContentManager.create();
  const sql = getDb();

  const headersList = await headers();
  const hostname = headersList.get("host") || "localhost";
  const pathname = headersList.get("x-pathname") || "/docs";

  const projectFromRequest = await getProjectFromRequest(hostname, pathname);

  if (!projectFromRequest) {
    notFound();
  }

  const [project] = await sql`
    SELECT id, name, slug, settings AS metadata
    FROM projects
    WHERE slug = ${projectFromRequest.slug}
  `;

  if (!project) {
    notFound();
  }

  const navigation = await cm.getNavigation(project.id);

  return <DocsLayoutClient navigation={navigation}>{children}</DocsLayoutClient>;
}
