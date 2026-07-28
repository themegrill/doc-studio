import type { NavRoute, Organization, Project, SeoData } from "@/lib/api";
import { stripTitleHTML } from "@/lib/parse-title-badges";

export type SocialImage = {
  url: string;
  secureUrl: string;
  width: number;
  height: number;
  alt: string;
  type: string;
};

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

export function toAbsoluteUrl(url: string | undefined, baseUrl: string): string | undefined {
  if (!url?.trim()) return undefined;
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return new URL(trimmed.startsWith("/") ? trimmed : `/${trimmed}`, baseUrl).toString();
}

export function buildCanonicalUrl(baseUrl: string, slug: string): string {
  return new URL(`/${slug}`, baseUrl).toString();
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
  project: Project | null,
  organization: Organization | null,
  title: string,
  baseUrl: string
): SocialImage | undefined {
  const metadata = project?.metadata || {};
  const rawImage =
    seo.ogImage ||
    (typeof metadata.ogImage === "string" ? metadata.ogImage : undefined) ||
    (typeof metadata.logo === "string" ? metadata.logo : undefined) ||
    metadata.organization?.logo ||
    organization?.logo;
  const url = toAbsoluteUrl(rawImage, baseUrl);
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

function findSectionTitle(
  routes: NavRoute[],
  slug: string,
  parentTitle?: string
): string | undefined {
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

export function getSectionTitle(routes: NavRoute[] | undefined, slug: string): string | undefined {
  return findSectionTitle(routes || [], slug);
}
