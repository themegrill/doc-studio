import { ContentManager } from "@/lib/db/ContentManager";
import { notFound } from "next/navigation";
import DocRendererClient from "@/components/docs/DocRendererClient";
import { getDb } from "@/lib/db/postgres";

export default async function ProjectDocPage({
  params,
}: {
  params: Promise<{ projectSlug: string; slug: string[] }>;
}) {
  const resolvedParams = await params;
  const { projectSlug, slug: slugArray } = resolvedParams;
  const slug = slugArray.join("/");

  console.log("[ProjectDocPage] Fetching document:", { projectSlug, slug });

  // Get project from slug
  const sql = getDb();
  const [project] = await sql`
    SELECT id, name, slug FROM projects WHERE slug = ${projectSlug}
  `;

  if (!project) {
    console.log("[ProjectDocPage] Project not found:", { projectSlug });
    notFound();
  }

  // Get document for this project
  const cm = ContentManager.create();
  const doc = await cm.getDoc(project.id, slug);

  if (!doc) {
    console.log("[ProjectDocPage] Document not found:", { projectSlug, slug });
    notFound();
  }

  return <DocRendererClient doc={doc} slug={slug} />;
}

export const dynamic = "force-dynamic";
