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

  // Get project
  const sql = getDb();
  const [project] = await sql`
    SELECT id, name, slug FROM projects WHERE slug = ${projectSlug}
  `;

  if (!project) {
    notFound();
  }

  // First, try to get this as a document (since [sectionSlug] route intercepts document requests)
  const cm = ContentManager.create();
  const doc = await cm.getDoc(project.id, sectionSlug);

  // If it's a document, render it as a document page
  if (doc) {
    return <DocRendererClient doc={doc} slug={sectionSlug} projectSlug={projectSlug} />;
  }

  // If not a document, try to find it as a section
  const navigation = await cm.getNavigation(project.id);

  // Helper to slugify section titles
  const slugify = (text: string) => {
    return text
      .toLowerCase()
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphens
      .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
  };

  const section = navigation?.routes?.find((route) => {
    const routeTitleSlug = slugify(route.title);

    // Check if route has a direct path match (old style sections)
    if (route.path === `/docs/${sectionSlug}` || route.slug === sectionSlug) {
      return true;
    }

    // Check if slugified title matches (for category sections with flat document structure)
    if (routeTitleSlug === sectionSlug) {
      return true;
    }

    // Check if this is a category section with children (hierarchical structure)
    if (route.children && route.children.length > 0) {
      // Extract section slug from first child's path
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

  if (!section) {
    notFound();
  }

  // Try to get section description/content
  const sectionDoc = await cm.getDoc(project.id, sectionSlug);

  // Get child documents from navigation structure (works with flat slugs)
  const childSlugs = section.children?.map((child) =>
    child.slug || child.path?.replace(/^\/docs\//, '')
  ).filter(Boolean) || [];

  // Fetch documents by their slugs
  const documents = childSlugs.length > 0 ? await sql`
    SELECT id, slug, title, description, created_at, updated_at
    FROM documents
    WHERE project_id = ${project.id}
      AND slug = ANY(${sql.array(childSlugs)})
      AND published = true
    ORDER BY order_index ASC, created_at ASC
  ` : [];

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Section content/description (if exists) */}
      {sectionDoc ? (
        <div className="mb-12">
          <DocRendererClient doc={sectionDoc} slug={sectionSlug} projectSlug={projectSlug} />

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
          <SectionHeader
            projectSlug={projectSlug}
            sectionSlug={sectionSlug}
            sectionTitle={section.title}
          />

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
              <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                <CardHeader>
                  <CardTitle className="flex items-start gap-2">
                    <FileText className="h-5 w-5 flex-shrink-0 mt-0.5" />
                    <span className="leading-snug">{doc.title}</span>
                  </CardTitle>
                  {doc.description && (
                    <CardDescription className="mt-2">{doc.description}</CardDescription>
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
