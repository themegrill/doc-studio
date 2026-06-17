import type { MetadataRoute } from "next";
import { ContentManager } from "@/lib/db/ContentManager";
import { getProjectBySlug } from "@/lib/project-helpers";

function getBaseUrl(): string {
  return (
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000"
  );
}

export default async function sitemap({
  params,
}: {
  params: { projectSlug: string };
}): Promise<MetadataRoute.Sitemap> {
  const { projectSlug } = params;

  const project = await getProjectBySlug(projectSlug);
  if (!project) return [];

  const cm = ContentManager.create();
  const docs = await cm.listDocs(project.id);

  const baseUrl = getBaseUrl();

  return docs.map((doc) => ({
    url: project.domain
      ? `https://${project.domain}/docs/${doc.slug}`
      : `${baseUrl}/projects/${projectSlug}/docs/${doc.slug}`,
    lastModified: doc.updatedAt ? new Date(doc.updatedAt) : new Date(),
    changeFrequency: "weekly" as const,
    priority: doc.slug.includes("/") ? 0.7 : 0.9,
  }));
}
