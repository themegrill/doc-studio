import { ContentManager } from "@/lib/db/ContentManager";
import { notFound } from "next/navigation";
import DocRendererClient from "@/components/docs/DocRendererClient";
import { headers } from "next/headers";
import { getProjectFromRequest } from "@/lib/project-helpers";

export default async function DocPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const resolvedParams = await params;
  const slug = resolvedParams.slug.join("/");

  // Get project from domain or default to 'default' project
  const headersList = await headers();
  const hostname = headersList.get("host") || "localhost";
  const pathname = headersList.get("x-pathname") || `/docs/${slug}`;

  const project = await getProjectFromRequest(hostname, pathname);

  if (!project) {
    console.error("[DocPage] No project found for:", { hostname, pathname });
    notFound();
  }

  console.log("[DocPage] Fetching document:", {
    project: project.slug,
    slug,
  });

  const cm = ContentManager.create();
  const doc = await cm.getDoc(project.id, slug);

  if (!doc) {
    console.log("[DocPage] Document not found:", {
      project: project.slug,
      slug,
    });
    notFound();
  }

  return <DocRendererClient doc={doc} slug={slug} />;
}

export const dynamic = "force-dynamic";
