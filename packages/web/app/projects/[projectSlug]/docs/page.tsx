import { getDb } from "@/lib/db/postgres";
import { notFound } from "next/navigation";
import { ContentManager } from "@/lib/db/ContentManager";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FolderOpen, FileText } from "lucide-react";

export default async function ProjectDocsIndexPage({
  params,
}: {
  params: Promise<{ projectSlug: string }>;
}) {
  const { projectSlug } = await params;

  // Get project from slug
  const sql = getDb();
  const [project] = await sql`
    SELECT id, name, slug, description FROM projects WHERE slug = ${projectSlug}
  `;

  if (!project) {
    notFound();
  }

  // Get navigation
  const cm = ContentManager.create();
  const navigation = await cm.getNavigation(project.id);

  const sections = navigation?.routes || [];

  // Get document counts for each section
  const sectionCounts = await Promise.all(
    sections.map(async (section) => {
      const sectionSlug = section.path.replace("/docs/", "");
      const [result] = await sql`
        SELECT COUNT(*)::int as count
        FROM documents
        WHERE project_id = ${project.id}
          AND slug LIKE ${sectionSlug + "/%"}
          AND published = true
      `;
      return {
        ...section,
        count: result?.count || 0,
      };
    })
  );

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">{project.name} Documentation</h1>
        {project.description && (
          <p className="text-gray-600">{project.description}</p>
        )}
      </div>

      {sections.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed rounded-lg">
          <FolderOpen className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No sections yet
          </h3>
          <p className="text-gray-500">
            Use the sidebar to create your first section to organize your documentation.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sectionCounts.map((section) => {
            const sectionSlug = section.path.replace("/docs/", "");
            return (
              <Link
                key={section.path}
                href={`/projects/${projectSlug}/docs/${sectionSlug}`}
              >
                <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FolderOpen className="h-5 w-5" />
                      {section.title}
                    </CardTitle>
                    <CardDescription className="flex items-center gap-1">
                      <FileText className="h-4 w-4" />
                      {section.count} {section.count === 1 ? "document" : "documents"}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export const dynamic = "force-dynamic";
