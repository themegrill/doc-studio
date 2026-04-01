import { notFound } from "next/navigation";
import Link from "next/link";
import { FolderOpen } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getProject, getNavigation } from "@/lib/api";
import type { NavRoute } from "@/lib/api";

interface SectionWithCount extends NavRoute {
  count: number;
}

export default async function DocsIndexPage() {
  const [project, navigation] = await Promise.all([getProject(), getNavigation()]);

  if (!project || !navigation) {
    notFound();
  }

  const sections: SectionWithCount[] = (navigation.routes || []).map(
    (section: NavRoute) => ({
      ...section,
      count: section.children?.length ?? (section.path ? 1 : 0),
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
          <h3 className="text-lg font-medium text-gray-900 mb-2">No sections yet</h3>
          <p className="text-gray-500">No documentation sections have been published yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sections.map((section) => {
            const sectionSlug = section.path
              ? section.path.replace("/docs/", "")
              : section.title
                  .toLowerCase()
                  .replace(/<[^>]*>/g, "")
                  .replace(/[^a-z0-9]+/g, "-")
                  .replace(/^-+|-+$/g, "");

            if (!sectionSlug) return null;

            return (
              <Link key={section.id ?? section.path} href={`/docs/${sectionSlug}`} className="h-full">
                <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer flex flex-col">
                  <CardHeader className="flex-1">
                    <CardTitle className="line-clamp-2 leading-snug">
                      {section.title}
                    </CardTitle>
                    <CardDescription className="mt-2 min-h-[1.5rem]">
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
