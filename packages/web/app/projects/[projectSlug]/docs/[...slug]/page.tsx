import type { Metadata } from "next";
import { ContentManager } from "@/lib/db/ContentManager";
import { notFound } from "next/navigation";
import DocRendererClient from "@/components/docs/DocRendererClient";
import SectionPage from "@/components/docs/SectionPage";
import { getDb } from "@/lib/db/postgres";
import { auth } from "@/lib/auth";

type PageParams = { projectSlug: string; slug: string[] };

function getBaseUrl(): string {
  return (
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000"
  );
}

function buildCanonicalUrl(
  projectSlug: string,
  slug: string,
  projectDomain: string | null
): string {
  if (projectDomain) {
    return `https://${projectDomain}/docs/${slug}`;
  }
  return `${getBaseUrl()}/projects/${projectSlug}/docs/${slug}`;
}

function buildJsonLd(
  doc: {
    title: string;
    description?: string;
    createdAt?: string;
    updatedAt?: string;
    seo?: { metaTitle?: string; metaDescription?: string; schemaType?: string };
  },
  projectName: string,
  canonicalUrl: string,
  breadcrumbBase: string
) {
  const schemaType = doc.seo?.schemaType || "Article";
  const headline = doc.seo?.metaTitle || doc.title;
  const description = doc.seo?.metaDescription || doc.description;

  const article: Record<string, unknown> = {
    "@type": schemaType,
    "@id": canonicalUrl,
    headline,
    url: canonicalUrl,
    publisher: {
      "@type": "Organization",
      name: projectName,
    },
  };

  if (description) article.description = description;
  if (doc.createdAt) article.datePublished = doc.createdAt;
  if (doc.updatedAt) article.dateModified = doc.updatedAt;

  const breadcrumb = {
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Docs",
        item: breadcrumbBase,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: doc.title,
        item: canonicalUrl,
      },
    ],
  };

  return {
    "@context": "https://schema.org",
    "@graph": [article, breadcrumb],
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { projectSlug, slug: slugArray } = await params;
  const slug = slugArray.join("/");

  const sql = getDb();
  const [project] = await sql`
    SELECT id, name, slug, domain FROM projects WHERE slug = ${projectSlug}
  `;
  if (!project) return {};

  const cm = ContentManager.create();
  const doc = await cm.getDoc(project.id, slug);
  if (!doc) return {};

  const seo = doc.seo || {};
  const title = seo.metaTitle || doc.title;
  const description = seo.metaDescription || doc.description || undefined;
  const canonicalUrl = buildCanonicalUrl(projectSlug, slug, project.domain ?? null);

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      type: "article",
      url: canonicalUrl,
      ...(doc.updatedAt && { modifiedTime: doc.updatedAt }),
      ...(doc.createdAt && { publishedTime: doc.createdAt }),
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

export default async function ProjectDocPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const resolvedParams = await params;
  const { projectSlug, slug: slugArray } = resolvedParams;
  const slug = slugArray.join("/");

  const sql = getDb();
  const [project] = await sql`
    SELECT id, name, slug, domain FROM projects WHERE slug = ${projectSlug}
  `;

  if (!project) {
    notFound();
  }

  const session = await auth();
  const cm = ContentManager.create();
  const doc = session?.user
    ? await cm.getDocAdmin(project.id, slug)
    : await cm.getDoc(project.id, slug);

  if (!doc) {
    // Check if it's a section without an overview doc
    if (!slug.includes("/")) {
      const [nav] = await sql`
        SELECT structure FROM navigation WHERE project_id = ${project.id}
      `;

      if (nav?.structure?.routes) {
        const sectionPath = `/docs/${slug}`;

        const section = nav.structure.routes.find((route: any) => {
          if (route.path === sectionPath) return true;
          if (route.children && route.children.length > 0) {
            const firstChildPath = route.children[0].path;
            if (
              firstChildPath === sectionPath ||
              firstChildPath === `/docs/${slug}`
            )
              return true;
          }
          return false;
        });

        if (section) {
          const childDocs =
            section.children?.map((child: any) => ({
              title: child.title,
              slug: child.path?.replace(/^\/docs\//, "") || child.slug,
            })) || [];

          return (
            <SectionPage
              projectSlug={projectSlug}
              sectionSlug={slug}
              sectionTitle={section.title}
              childDocs={childDocs}
            />
          );
        }
      }
    }

    notFound();
  }

  const canonicalUrl = buildCanonicalUrl(projectSlug, slug, project.domain ?? null);
  const breadcrumbBase = project.domain
    ? `https://${project.domain}/docs`
    : `${getBaseUrl()}/projects/${projectSlug}/docs`;

  const jsonLd = buildJsonLd(doc, project.name, canonicalUrl, breadcrumbBase);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <DocRendererClient doc={doc} slug={slug} projectSlug={projectSlug} />
    </>
  );
}

export const dynamic = "force-dynamic";
