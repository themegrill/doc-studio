import { ContentManager } from "@/lib/db/ContentManager";
import DocsLayoutClient from "@/components/docs/DocsLayoutClient";
import { headers } from "next/headers";
import { getProjectFromRequest } from "@/lib/project-helpers";
import { notFound } from "next/navigation";

export default async function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cm = ContentManager.create();

  // Get project from domain
  const headersList = await headers();
  const hostname = headersList.get("host") || "localhost";
  const pathname = headersList.get("x-pathname") || "/docs";

  const project = await getProjectFromRequest(hostname, pathname);

  if (!project) {
    notFound();
  }

  const navigation = await cm.getNavigation(project.id);

  return <DocsLayoutClient navigation={navigation}>{children}</DocsLayoutClient>;
}
