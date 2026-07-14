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
import SectionHeader from "@/components/docs/SectionPage";

export default async function SectionPage({
  params,
}: {
  params: Promise<{ projectSlug: string; sectionSlug: string }>;
}) {
  const { projectSlug, sectionSlug } = await params;
  const session = await auth();
  const isAuthenticated = !!session?.user;

  const sql = getDb();
  const [project] = await sql`
    SELECT id, name, slug FROM projects WHERE slug = ${projectSlug}
  `;

  if (!project) {
    notFound();
  }

  const cm = ContentManager.create();

  // Helper to slugify section titles
  const slugify = (text: string) => {
    return text
      .toLowerCase()
      .replace(/<[^>]*>/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  };

  // Check navigation sections first — sections take priority over same-slug documents
  const navigation = await cm.getNavigation(project.id);

  const section = navigation?.routes?.find((route) => {
    const routeTitleSlug = slugify(route.title);

    if (route.path === `/docs/${sectionSlug}` || route.slug === sectionSlug) {
      return true;
    }

    if (routeTitleSlug === sectionSlug) {
      return true;
    }

    if (route.children && route.children.length > 0) {
      const firstChildPath = route.children[0].path || route.children[0].slug;

      if (firstChildPath) {
        const childSectionSlug = firstChildPath.replace(/^\/docs\//, '').split('/')[0];

        if (childSectionSlug === sectionSlug) {
          return true;
        }
      }
    }

    return false;
  });

  // If no section match, fall back to rendering it as a document
  if (!section) {
    const doc = await cm.getDoc(project.id, sectionSlug);

    if (!doc) {
      notFound();
    }

    return <DocRendererClient doc={doc} slug={sectionSlug} projectSlug={projectSlug} />;
  }

  // It's a section — fetch overview doc and child documents in parallel
  const childSlugs = section.children?.map((child) =>
    child.slug || child.path?.replace(/^\/docs\//, '')
  ).filter(Boolean) || [];

  const validChildSlugs = childSlugs.filter(
    (slug): slug is string => typeof slug === "string" && slug.length > 0
  );

  const [sectionDoc, documents] = await Promise.all([
    isAuthenticated ? cm.getDocAdmin(project.id, sectionSlug) : cm.getDoc(project.id, sectionSlug),
    validChildSlugs.length > 0
      ? isAuthenticated
        ? sql`
            SELECT id, slug, title, description, published, created_at, updated_at
            FROM documents
            WHERE project_id = ${project.id}
              AND slug = ANY(${sql.array(validChildSlugs)})
              AND deleted_at IS NULL
            ORDER BY order_index ASC, created_at ASC
          `
        : sql`
            SELECT id, slug, title, description, published, created_at, updated_at
            FROM documents
            WHERE project_id = ${project.id}
              AND slug = ANY(${sql.array(validChildSlugs)})
              AND published = true
              AND deleted_at IS NULL
            ORDER BY order_index ASC, created_at ASC
          `
      : Promise.resolve([]),
  ]);

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Section content/description (if exists) */}
      {sectionDoc ? (
        <div className="mb-12">
          <DocRendererClient doc={sectionDoc} slug={sectionSlug} projectSlug={projectSlug} isSectionOverview={true} />

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
          <SectionHeader
            projectSlug={projectSlug}
            sectionSlug={sectionSlug}
            sectionTitle={section.title}
          />

          {isAuthenticated && (
            <AddSectionOverviewButton
              projectSlug={projectSlug}
              sectionSlug={sectionSlug}
              sectionTitle={section.title}
            />
          )}
        </>
      )}

      {/* Child documents list */}
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
        <>
          {sectionDoc && (
            <h2 className="text-xl font-semibold mb-4">Documents in this section</h2>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {documents.map((doc) => (
              <Link
                key={doc.id}
                href={`/projects/${projectSlug}/docs/${doc.slug}`}
                className="h-full"
              >
                <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer flex flex-col">
                  <CardHeader className="flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="line-clamp-2 leading-snug flex-1">
                        {doc.title}
                      </CardTitle>
                      {isAuthenticated && (
                        <span
                          className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            doc.published
                              ? "bg-green-100 text-green-700 border border-green-200"
                              : "bg-yellow-100 text-yellow-700 border border-yellow-200"
                          }`}
                        >
                          {doc.published ? "Published" : "Draft"}
                        </span>
                      )}
                    </div>
                    {doc.description && (
                      <CardDescription className="mt-2 line-clamp-2">
                        {doc.description}
                      </CardDescription>
                    )}
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

export const dynamic = "force-dynamic";
