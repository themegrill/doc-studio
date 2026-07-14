import { getDb } from "@/lib/db/postgres";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ContentManager } from "@/lib/db/ContentManager";
import { checkProjectAccess } from "@/lib/project-helpers";
import TrashList from "@/components/docs/TrashList";

export default async function ProjectDocsTrashPage({
  params,
}: {
  params: Promise<{ projectSlug: string }>;
}) {
  const { projectSlug } = await params;
  const session = await auth();

  if (!session?.user?.id) {
    redirect(`/login`);
  }

  const sql = getDb();
  const [project] = await sql`
    SELECT id, name, slug FROM projects WHERE slug = ${projectSlug}
  `;

  if (!project) {
    notFound();
  }

  const hasAccess = await checkProjectAccess(session.user.id, project.id, "editor");
  if (!hasAccess) {
    notFound();
  }

  const cm = ContentManager.create();
  const documents = await cm.listTrashedDocs(project.id);

  return (
    <div className="max-w-4xl mx-auto p-6">
      <Link
        href={`/projects/${projectSlug}/docs`}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-4"
      >
        <ArrowLeft size={16} />
        Back to documentation
      </Link>
      <div className="mb-6">
        <h1 className="text-3xl font-medium mb-2">Trash</h1>
        <p className="text-gray-600">
          Deleted documents are kept here. Restore them or delete them permanently.
        </p>
      </div>
      <hr className="mb-8" />

      <TrashList
        projectSlug={projectSlug}
        documents={documents.map((doc) => ({
          id: doc.id,
          slug: doc.slug,
          title: doc.title,
          description: doc.description,
          updatedAt: doc.updatedAt,
        }))}
      />
    </div>
  );
}

export const dynamic = "force-dynamic";
