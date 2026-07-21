import type { Metadata } from "next";
import { ContentManager } from "@/lib/db/ContentManager";
import { notFound } from "next/navigation";
import DocRendererClient from "@/components/docs/DocRendererClient";
import SectionPage from "@/components/docs/SectionPage";
import { getDb } from "@/lib/db/postgres";
import { auth } from "@/lib/auth";
import { stripTitleHTML } from "@/lib/parse-title-badges";
import type { NavRoute, SeoData } from "@/lib/db/ContentManager";

type PageParams = { projectSlug: string; slug: string[] };
type ProjectSeoData = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  domain?: string | null;
  metadata?: Record<string, unknown> | null;
};
type SocialImage = {
  url: string;
  secureUrl: string;
  width: number;
  height: number;
  alt: string;
  type: string;
};

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

function stripHtml(value?: string | null): string {
  if (!value) return "";
  return stripTitleHTML(value).replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function toIsoDate(value?: string | Date | null): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function toAbsoluteUrl(url: string | undefined, projectDomain?: string | null): string | undefined {
  if (!url?.trim()) return undefined;
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const base = projectDomain ? `https://${projectDomain}` : getBaseUrl();
  return new URL(trimmed.startsWith("/") ? trimmed : `/${trimmed}`, base).toString();
}

function inferImageType(url: string): string {
  const cleanUrl = url.split("?")[0].toLowerCase();
  if (cleanUrl.endsWith(".png")) return "image/png";
  if (cleanUrl.endsWith(".webp")) return "image/webp";
  if (cleanUrl.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

function buildSocialImage(
  seo: SeoData,
  project: ProjectSeoData,
  title: string
): SocialImage | undefined {
  const metadata = project.metadata || {};
  const rawImage =
    seo.ogImage ||
    (typeof metadata.ogImage === "string" ? metadata.ogImage : undefined) ||
    (typeof metadata.socialImage === "string" ? metadata.socialImage : undefined) ||
    (typeof metadata.logo === "string" ? metadata.logo : undefined);
  const url = toAbsoluteUrl(rawImage, project.domain);
  if (!url) return undefined;

  return {
    url,
    secureUrl: url.replace(/^http:\/\//i, "https://"),
    width: Number(metadata.ogImageWidth) || 1200,
    height: Number(metadata.ogImageHeight) || 630,
    alt: stripHtml(seo.ogImageAlt) || title,
    type: inferImageType(url),
  };
}

function buildRobotsContent(seo: SeoData): string {
  const robots = seo.robots || {};
  return [
    robots.index === false ? "noindex" : "index",
    robots.follow === false ? "nofollow" : "follow",
    `max-snippet:${robots.maxSnippet ?? -1}`,
    `max-video-preview:${robots.maxVideoPreview ?? -1}`,
    `max-image-preview:${robots.maxImagePreview ?? "large"}`,
  ].join(", ");
}

function findSectionTitle(routes: NavRoute[], slug: string, parentTitle?: string): string | undefined {
  for (const route of routes) {
    const routeSlug = route.slug || route.path?.replace(/^\/docs\//, "");
    if (routeSlug === slug) {
      return parentTitle ? stripHtml(parentTitle) : undefined;
    }
    if (route.children?.length) {
      const childMatch = findSectionTitle(route.children, slug, route.title);
      if (childMatch !== undefined) return childMatch;
    }
  }
  return undefined;
}

function buildJsonLd(
  doc: {
    title: string;
    description?: string;
    createdAt?: string | Date;
    updatedAt?: string | Date;
    seo?: SeoData;
  },
  project: ProjectSeoData,
  canonicalUrl: string,
  breadcrumbBase: string,
  sectionTitle?: string,
  image?: SocialImage
) {
  const schemaType = doc.seo?.schemaType || "Article";
  const headline = stripHtml(doc.seo?.metaTitle || doc.title);
  const description = stripHtml(doc.seo?.metaDescription || doc.description);
  const pageName = stripHtml(doc.title);
  const projectName = stripHtml(project.name);
  const logoUrl = toAbsoluteUrl(
    typeof project.metadata?.logo === "string" ? project.metadata.logo : undefined,
    project.domain
  );
  const websiteUrl = project.domain
    ? `https://${project.domain}`
    : `${getBaseUrl()}/projects/${project.slug}`;
  const organizationId = `${websiteUrl}#organization`;
  const websiteId = `${websiteUrl}#website`;
  const webpageId = `${canonicalUrl}#webpage`;
  const imageId = image ? `${image.url}#primaryimage` : undefined;

  const article: Record<string, unknown> = {
    "@type": schemaType,
    "@id": `${canonicalUrl}#article`,
    headline,
    url: canonicalUrl,
    mainEntityOfPage: { "@id": webpageId },
    publisher: { "@id": organizationId },
  };

  if (description) article.description = description;
  if (sectionTitle) article.articleSection = sectionTitle;
  if (imageId) article.image = { "@id": imageId };
  const datePublished = toIsoDate(doc.createdAt);
  const dateModified = toIsoDate(doc.updatedAt);
  if (datePublished) article.datePublished = datePublished;
  if (dateModified) article.dateModified = dateModified;

  const organization: Record<string, unknown> = {
    "@type": "Organization",
    "@id": organizationId,
    name: projectName,
    url: websiteUrl,
  };
  if (logoUrl) {
    organization.logo = {
      "@type": "ImageObject",
      url: logoUrl,
    };
  }

  const website = {
    "@type": "WebSite",
    "@id": websiteId,
    name: projectName,
    url: websiteUrl,
    publisher: { "@id": organizationId },
  };

  const webpage: Record<string, unknown> = {
    "@type": "WebPage",
    "@id": webpageId,
    url: canonicalUrl,
    name: headline,
    isPartOf: { "@id": websiteId },
    primaryImageOfPage: imageId ? { "@id": imageId } : undefined,
    breadcrumb: { "@id": `${canonicalUrl}#breadcrumb` },
    datePublished,
    dateModified,
  };
  if (description) webpage.description = description;

  const breadcrumb = {
    "@type": "BreadcrumbList",
    "@id": `${canonicalUrl}#breadcrumb`,
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
        name: pageName,
        item: canonicalUrl,
      },
    ],
  };

  const imageObject = image
    ? {
        "@type": "ImageObject",
        "@id": imageId,
        url: image.url,
        contentUrl: image.url,
        width: image.width,
        height: image.height,
        caption: image.alt,
      }
    : undefined;

  return {
    "@context": "https://schema.org",
    "@graph": [organization, website, webpage, article, breadcrumb, imageObject].filter(Boolean),
  };
}

async function getSectionTitle(projectId: string, slug: string): Promise<string | undefined> {
  const cm = ContentManager.create();
  const navigation = await cm.getNavigation(projectId);
  return findSectionTitle(navigation.routes, slug);
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

  const jsonLd = buildJsonLd(doc, projectSeo, canonicalUrl, breadcrumbBase, sectionTitle, image);

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
