import { notFound } from "next/navigation";
import Link from "next/link";
import { FolderOpen, FileText } from "lucide-react";
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
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Hero */}
      <div className="mb-10 pb-8 border-b border-gray-100">
        <h1 className="text-3xl font-medium tracking-tight text-gray-950 mb-3" style={{ fontWeight: 500, color: "#383838" }}>
          {project.name} Documentation
        </h1>
        {project.description ? (
          <p className="text-base text-gray-500 max-w-2xl">{project.description}</p>
        ) : (
          <p className="text-base text-gray-400 max-w-2xl">
            Browse the sections below to find what you&apos;re looking for.
          </p>
        )}
      </div>

      {sections.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50">
          <FolderOpen className="h-12 w-12 mx-auto text-gray-300 mb-4" />
          <h3 className="text-base font-semibold text-gray-700 mb-1">No sections yet</h3>
          <p className="text-sm text-gray-400">No documentation sections have been published yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {sections.map((section, index) => {
            const sectionSlug = getSectionSlug(section);
            if (!sectionSlug) return null;

            const previewDocs = section.children?.slice(0, MAX_DOCS_PREVIEW) ?? [];
            const hasMore = section.count > MAX_DOCS_PREVIEW;

            return (
              <div
                key={section.id ?? section.path}
                className="border border-gray-200 rounded-xl bg-white flex flex-col overflow-hidden"
              >
                {/* Card Header */}
                <div className="px-5 pt-5 pb-4">
                  <div className="flex items-center justify-between gap-3 mb-4"  style={{ height: "40px" }}>
                    <h2 className="text-lg leading-snug" style={{ fontWeight: 500, color: "#383838" }}>
                      {section.title}
                    </h2>
                    {section.count > 0 && (
                      <span className="shrink-0 text-sm font-medium text-gray-500 bg-gray-100 rounded px-2 py-0.5">
                        {section.count}
                      </span>
                    )}
                  </div>
                  <hr className="border-gray-200" />
                </div>

                {previewDocs.length === 0 ? (
                  /* Empty state */
                  <div className="flex-1 flex flex-col items-center justify-center gap-2 px-5 pb-6 text-center">
                    <FileText className="h-8 w-8 text-gray-200" />
                    <p className="text-sm text-gray-400">No documents published yet.</p>
                  </div>
                ) : (
                  /* Card Body — doc list */
                  <div className="flex-1 px-5 py-4 flex flex-col gap-3">
                    {previewDocs.map((doc) => {
                      const docSlug = doc.path
                        ? doc.path.replace("/docs/", "")
                        : doc.slug ?? getSectionSlug(doc);
                      return (
                        <Link
                          key={doc.id ?? doc.path}
                          href={`/${docSlug}`}
                          className="flex items-start gap-2.5 text-md hover:text-blue-800 text-gray-500 transition-colors"
                        >
                          <FileText className="h-4 w-4 mt-0.5 shrink-0 text-gray-500 hover:text-blue-800" />
                          <span className="line-clamp-2 leading-snug">{doc.title}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}

                {/* Card Footer */}
                <div className="px-5 pb-5 pt-5 mt-auto">
                  <Link
                    href={`/${sectionSlug}`}
                    className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 border border-blue-200 rounded px-4 py-2 hover:bg-blue-50 transition-colors"
                  >
                    {hasMore ? "Explore More" : "View Section"}
                    <span className="ml-0.5">›</span>
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
