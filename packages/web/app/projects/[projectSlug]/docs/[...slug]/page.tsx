import type { Metadata } from "next";
import { ContentManager } from "@/lib/db/ContentManager";
import { notFound } from "next/navigation";
import DocRendererClient from "@/components/docs/DocRendererClient";
import SectionPage from "@/components/docs/SectionPage";
import { getDb } from "@/lib/db/postgres";
import { auth } from "@/lib/auth";
import type { NavRoute } from "@/lib/db/ContentManager";
import {
  buildCanonicalUrl,
  buildJsonLd,
  buildRobotsContent,
  buildSocialImage,
  getBaseUrl,
  getSectionTitle,
  stripHtml,
  toAbsoluteUrl,
  toIsoDate,
  type ProjectSeoData,
  applyTitleSuffix,
} from "@/lib/seo/doc-metadata";
import { getGuidelines } from "@/lib/editorial/config";

type PageParams = { projectSlug: string; slug: string[] };

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { projectSlug, slug: slugArray } = await params;
  const slug = slugArray.join("/");

  const sql = getDb();
  const [project] = await sql`
    SELECT id, name, slug, description, domain, metadata FROM projects WHERE slug = ${projectSlug}
  `;
  if (!project) return {};
  const projectSeo = project as ProjectSeoData;

  const cm = ContentManager.create();
  const doc = await cm.getDoc(projectSeo.id, slug);
  if (!doc) return {};

  const seo = doc.seo || {};
  const title = stripHtml(seo.metaTitle || doc.title);
  const description = stripHtml(seo.metaDescription || doc.description) || undefined;
  const canonicalUrl =
    toAbsoluteUrl(seo.canonicalUrl, projectSeo.domain ?? null) ||
    buildCanonicalUrl(projectSlug, slug, projectSeo.domain ?? null);
  const sectionTitle = await getSectionTitle(projectSeo.id, slug);
  const image = buildSocialImage(seo, projectSeo, title);
  const publishedTime = toIsoDate(doc.createdAt);
  const modifiedTime = toIsoDate(doc.updatedAt);
  const robotsContent = buildRobotsContent(seo);
  // The site-name suffix the guideline calls a "smart tag" (DOCSTUDIO-45 §4.4).
  const { metaTitle: metaTitleRules } = await getGuidelines(projectSlug);

  return {
    title: applyTitleSuffix(title, metaTitleRules.suffix),
    description,
    robots: robotsContent,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: stripHtml(seo.ogTitle || title),
      description: stripHtml(seo.ogDescription || description),
      type: "article",
      url: canonicalUrl,
      locale: "en_US",
      siteName: stripHtml(projectSeo.name),
      ...(sectionTitle && { section: sectionTitle }),
      ...(modifiedTime && { modifiedTime }),
      ...(publishedTime && { publishedTime }),
      ...(image && {
        images: [
          {
            url: image.url,
            secureUrl: image.secureUrl,
            width: image.width,
            height: image.height,
            alt: image.alt,
            type: image.type,
          },
        ],
      }),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      ...(image && { images: [image.url] }),
    },
    other: {
      ...(sectionTitle && { "article:section": sectionTitle }),
      ...(publishedTime && { "article:published_time": publishedTime }),
      ...(modifiedTime && { "article:modified_time": modifiedTime }),
      ...(image && {
        "og:image": image.url,
        "og:image:secure_url": image.secureUrl,
        "og:image:width": String(image.width),
        "og:image:height": String(image.height),
        "og:image:alt": image.alt,
        "og:image:type": image.type,
        "twitter:image": image.url,
      }),
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
    SELECT id, name, slug, description, domain, metadata FROM projects WHERE slug = ${projectSlug}
  `;

  if (!project) {
    notFound();
  }
  const projectSeo = project as ProjectSeoData;

  const session = await auth();
  const cm = ContentManager.create();
  const doc = session?.user
    ? await cm.getDocAdmin(projectSeo.id, slug)
    : await cm.getDoc(projectSeo.id, slug);

  if (!doc) {
    // Check if it's a section without an overview doc
    if (!slug.includes("/")) {
      const [nav] = await sql`
        SELECT structure FROM navigation WHERE project_id = ${projectSeo.id}
      `;

      if (nav?.structure?.routes) {
        const sectionPath = `/docs/${slug}`;

        const section = (nav.structure.routes as NavRoute[]).find((route) => {
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
            section.children?.map((child, index) => ({
              id: child.id || child.path || child.slug || `${sectionPath}-${index}`,
              title: child.title,
              slug: child.path?.replace(/^\/docs\//, "") || child.slug || "",
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

  const canonicalUrl =
    toAbsoluteUrl(doc.seo?.canonicalUrl, projectSeo.domain ?? null) ||
    buildCanonicalUrl(projectSlug, slug, projectSeo.domain ?? null);
  const breadcrumbBase = projectSeo.domain
    ? `https://${projectSeo.domain}/docs`
    : `${getBaseUrl()}/projects/${projectSlug}/docs`;
  const sectionTitle = await getSectionTitle(projectSeo.id, slug);
  const title = stripHtml(doc.seo?.metaTitle || doc.title);
  const image = buildSocialImage(doc.seo || {}, projectSeo, title);

  const jsonLd = await buildJsonLd(doc, projectSeo, canonicalUrl, breadcrumbBase, sectionTitle, image);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <DocRendererClient key={`${projectSlug}/${slug}`} doc={doc} slug={slug} projectSlug={projectSlug} />
    </>
  );
}

export const dynamic = "force-dynamic";
