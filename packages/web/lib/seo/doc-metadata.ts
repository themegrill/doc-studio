import { ContentManager } from "@/lib/db/ContentManager";
import type { NavRoute, SeoData } from "@/lib/db/ContentManager";
import { getDb } from "@/lib/db/postgres";
import { stripTitleHTML } from "@/lib/parse-title-badges";

export type ProjectSeoData = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  domain?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type SocialImage = {
  url: string;
  secureUrl: string;
  width: number;
  height: number;
  alt: string;
  type: string;
};

interface OrganizationConfig {
  name: string;
  logo: string;
  url: string;
  organizationId?: string;
}

const ORG_SETTINGS_KEY = "organization.config";

export function getBaseUrl(): string {
  return (
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000"
  );
}

export function buildCanonicalUrl(
  projectSlug: string,
  slug: string,
  projectDomain: string | null
): string {
  if (projectDomain) {
    return `https://${projectDomain}/docs/${slug}`;
  }
  return `${getBaseUrl()}/projects/${projectSlug}/docs/${slug}`;
}

export function stripHtml(value?: string | null): string {
  if (!value) return "";
  return stripTitleHTML(value).replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

export function toIsoDate(value?: string | Date | null): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function toAbsoluteUrl(url: string | undefined, projectDomain?: string | null): string | undefined {
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

export function buildSocialImage(
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

export function buildRobotsContent(seo: SeoData): string {
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

export async function getSectionTitle(projectId: string, slug: string): Promise<string | undefined> {
  const cm = ContentManager.create();
  const navigation = await cm.getNavigation(projectId);
  return findSectionTitle(navigation.routes, slug);
}

/**
 * Canonical organization identity shared across all projects, plus an
 * optional externally-hosted canonical @id for schema.org JSON-LD. Read is
 * unauthenticated on purpose — doc pages fetch this server-side to build
 * their Organization reference.
 */
export async function getOrganizationConfig(): Promise<OrganizationConfig> {
  const sql = getDb();
  const [row] = await sql`
    SELECT value FROM global_settings WHERE key = ${ORG_SETTINGS_KEY}
  `;
  return {
    name: "",
    logo: "",
    url: "",
    ...(row?.value as Partial<OrganizationConfig> | undefined),
  };
}

export async function buildJsonLd(
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
  const websiteUrl = project.domain
    ? `https://${project.domain}`
    : `${getBaseUrl()}/projects/${project.slug}`;

  const orgConfig = await getOrganizationConfig();
  const organizationId = orgConfig.organizationId?.trim() || `${websiteUrl}#organization`;
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
    "@graph": [website, webpage, article, breadcrumb, imageObject].filter(Boolean),
  };
}
