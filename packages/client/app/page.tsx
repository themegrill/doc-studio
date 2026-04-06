import { notFound } from "next/navigation";
import Link from "next/link";
import { FolderOpen, FileText, ChevronRight } from "lucide-react";
import { getProject, getNavigation } from "@/lib/api";
import type { NavRoute } from "@/lib/api";

const MAX_DOCS_PREVIEW = 3;

function getSectionSlug(section: NavRoute): string {
  if (section.path) return section.path.replace("/docs/", "");
  return section.title
    .toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default async function RootPage() {
  const [project, navigation] = await Promise.all([getProject(), getNavigation()]);

  if (!project || !navigation) {
    notFound();
  }

  const sections = (navigation.routes || []).map((section: NavRoute) => ({
    ...section,
    count: section.children?.length ?? (section.path ? 1 : 0),
  }));

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-10">
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {sections.map((section) => {
            const sectionSlug = getSectionSlug(section);
            if (!sectionSlug) return null;

            const previewDocs = section.children?.slice(0, MAX_DOCS_PREVIEW) ?? [];
            const hasMore = section.count > MAX_DOCS_PREVIEW;

            return (
              <div
                key={section.id ?? section.path}
                className="border rounded-lg bg-white flex flex-col overflow-hidden"
              >
                {/* Card Header */}
                <div className="px-5 pt-5 pb-4 border-b">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-base font-semibold text-gray-900 leading-snug">
                      {section.title}
                    </h2>
                    {section.count > 0 && (
                      <span className="shrink-0 text-xs font-medium text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">
                        {section.count}
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Body — doc list */}
                <div className="flex-1 px-5 py-3 flex flex-col gap-1.5">
                  {previewDocs.length === 0 ? (
                    <p className="text-sm text-gray-400 py-2">No documents published yet.</p>
                  ) : (
                    previewDocs.map((doc) => {
                      const docSlug = doc.path
                        ? doc.path.replace("/docs/", "")
                        : doc.slug ?? getSectionSlug(doc);
                      return (
                        <Link
                          key={doc.id ?? doc.path}
                          href={`/${docSlug}`}
                          className="flex items-start gap-2 text-sm text-blue-700 hover:text-blue-900 hover:underline group"
                        >
                          <FileText className="h-3.5 w-3.5 mt-0.5 shrink-0 text-blue-400 group-hover:text-blue-700" />
                          <span className="line-clamp-2 leading-snug">{doc.title}</span>
                        </Link>
                      );
                    })
                  )}
                </div>

                {/* Card Footer */}
                <div className="px-5 pb-5 pt-3">
                  <Link
                    href={`/${sectionSlug}`}
                    className="inline-flex items-center gap-1 text-sm border border-gray-300 rounded px-3 py-1.5 text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    {hasMore ? "Explore More" : "View Section"}
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export const dynamic = "force-dynamic";
