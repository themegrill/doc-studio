import type { Metadata } from "next";
import { ContentManager } from "@/lib/db/ContentManager";
import { notFound } from "next/navigation";
import DocRendererClient from "@/components/docs/DocRendererClient";
import { headers } from "next/headers";
import { getProjectFromRequest } from "@/lib/project-helpers";
import { getDb } from "@/lib/db/postgres";
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
} from "@/lib/seo/doc-metadata";

async function resolveProject(): Promise<{ project: ProjectSeoData; slug: string } | null> {
  const headersList = await headers();
  const hostname = headersList.get("host") || "localhost";
  const pathname = headersList.get("x-pathname") || "/docs";

  const projectFromRequest = await getProjectFromRequest(hostname, pathname);
  if (!projectFromRequest) return null;

  const sql = getDb();
  const [project] = await sql`
    SELECT id, name, slug, description, domain, metadata FROM projects WHERE id = ${projectFromRequest.id}
  `;
  if (!project) return null;

  const slugMatch = pathname.match(/^\/docs\/(.+)$/);
  const slug = slugMatch ? slugMatch[1] : "";

  return { project: project as ProjectSeoData, slug };
}

export async function generateMetadata(): Promise<Metadata> {
  const resolved = await resolveProject();
  if (!resolved) return {};
  const { project: projectSeo, slug } = resolved;

  const cm = ContentManager.create();
  const doc = await cm.getDoc(projectSeo.id, slug);
  if (!doc) return {};

  const seo = doc.seo || {};
  const title = stripHtml(seo.metaTitle || doc.title);
  const description = stripHtml(seo.metaDescription || doc.description) || undefined;
  const canonicalUrl =
    toAbsoluteUrl(seo.canonicalUrl, projectSeo.domain ?? null) ||
    buildCanonicalUrl(projectSeo.slug, slug, projectSeo.domain ?? null);
  const sectionTitle = await getSectionTitle(projectSeo.id, slug);
  const image = buildSocialImage(seo, projectSeo, title);
  const publishedTime = toIsoDate(doc.createdAt);
  const modifiedTime = toIsoDate(doc.updatedAt);
  const robotsContent = buildRobotsContent(seo);

  return {
    title,
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

export default async function DocPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const resolvedParams = await params;
  const slug = resolvedParams.slug.join("/");

  const headersList = await headers();
  const hostname = headersList.get("host") || "localhost";
  const pathname = headersList.get("x-pathname") || `/docs/${slug}`;

  const project = await getProjectFromRequest(hostname, pathname);

  if (!project) {
    console.error("[DocPage] No project found for:", { hostname, pathname });
    notFound();
  }

  const sql = getDb();
  const [projectRow] = await sql`
    SELECT id, name, slug, description, domain, metadata FROM projects WHERE id = ${project.id}
  `;
  if (!projectRow) {
    notFound();
  }
  const projectSeo = projectRow as ProjectSeoData;

  const cm = ContentManager.create();
  const doc = await cm.getDoc(projectSeo.id, slug);

  if (!doc) {
    console.log("[DocPage] Document not found:", {
      project: projectSeo.slug,
      slug,
    });
    notFound();
  }

  const canonicalUrl =
    toAbsoluteUrl(doc.seo?.canonicalUrl, projectSeo.domain ?? null) ||
    buildCanonicalUrl(projectSeo.slug, slug, projectSeo.domain ?? null);
  const breadcrumbBase = projectSeo.domain
    ? `https://${projectSeo.domain}/docs`
    : `${getBaseUrl()}/projects/${projectSeo.slug}/docs`;
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
      <DocRendererClient key={`${projectSeo.slug}/${slug}`} doc={doc} slug={slug} projectSlug={projectSeo.slug} />
    </>
  );
}

export const dynamic = "force-dynamic";
