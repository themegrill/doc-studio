import { ContentManager } from "@/lib/db/ContentManager";
import { getDb } from "@/lib/db/postgres";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { FileText } from "lucide-react";
import DocRendererClient from "@/components/docs/DocRendererClient";
import AddSectionOverviewButton from "@/components/docs/AddSectionOverviewButton";
import RemoveSectionOverviewButton from "@/components/docs/RemoveSectionOverviewButton";

export default async function SectionPage({
  params,
}: {
  params: Promise<{ projectSlug: string; sectionSlug: string }>;
}) {
  const { projectSlug, sectionSlug } = await params;
  const session = await auth();
  const isAuthenticated = !!session?.user;

  // Get project
  const sql = getDb();
  const [project] = await sql`
    SELECT id, name, slug FROM projects WHERE slug = ${projectSlug}
  `;

  if (!project) {
    notFound();
  }

  // Get navigation to find this section
  const cm = ContentManager.create();
  const navigation = await cm.getNavigation(project.id);

  const section = navigation?.routes?.find(
    (route) => route.path === `/docs/${sectionSlug}`,
  );

  if (!section) {
    notFound();
  }

  // Try to get section description/content (document with slug matching section)
  const sectionDoc = await cm.getDoc(project.id, sectionSlug);

  // Get child documents for this section
  const documents = await sql`
    SELECT id, slug, title, description, created_at, updated_at
    FROM documents
    WHERE project_id = ${project.id}
      AND slug LIKE ${sectionSlug + "/%"}
      AND published = true
    ORDER BY order_index ASC, created_at ASC
  `;

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Section content/description (if exists) */}
      {sectionDoc ? (
        <div className="mb-12">
          <DocRendererClient doc={sectionDoc} slug={sectionSlug} />

          {/* Remove Overview Button for authenticated users */}
          {isAuthenticated && (
            <RemoveSectionOverviewButton
              projectSlug={projectSlug}
              sectionSlug={sectionSlug}
              sectionTitle={section.title}
            />
          )}
        </div>
      ) : (
        <>
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-2">{section.title}</h1>
            <p className="text-gray-600">
              {documents.length}{" "}
              {documents.length === 1 ? "document" : "documents"}
            </p>
          </div>

          {/* Add Overview Button for authenticated users */}
          {isAuthenticated && (
            <AddSectionOverviewButton
              projectSlug={projectSlug}
              sectionSlug={sectionSlug}
              sectionTitle={section.title}
            />
          )}
        </>
      )}

      {/* Child documents section */}
      {documents.length > 0 && (
        <div className="mb-4">
          <h2 className="text-2xl font-semibold mb-4">
            {sectionDoc ? "Documents in this section" : ""}
          </h2>
        </div>
      )}

      {documents.length === 0 && !sectionDoc ? (
        isAuthenticated ? (
          <div className="text-center py-12 border-2 border-dashed rounded-lg">
            <FileText className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No documents yet
            </h3>
            <p className="text-gray-500">
              Use the sidebar to add your first document to this section.
            </p>
          </div>
        ) : null
      ) : documents.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {documents.map((doc) => (
            <Link
              key={doc.id}
              href={`/projects/${projectSlug}/docs/${doc.slug}`}
            >
              <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    {doc.title}
                  </CardTitle>
                  {doc.description && (
                    <CardDescription>{doc.description}</CardDescription>
                  )}
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export const dynamic = "force-dynamic";
