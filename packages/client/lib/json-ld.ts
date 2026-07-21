import type { DocContent, Organization, Project } from "@/lib/api";
import type { BreadcrumbItem } from "@/components/docs/Breadcrumb";
import { stripTitleHTML } from "@/lib/parse-title-badges";

const SCHEMA_TYPES = ["Article", "TechArticle", "HowTo", "FAQPage"] as const;

/**
 * Builds a schema.org @graph for a doc page: Organization, WebSite, WebPage,
 * an ImageObject for the social/OG image (when one resolves), the doc itself
 * (Article/TechArticle/HowTo/FAQPage per seo.schemaType), and a BreadcrumbList.
 * Nodes reference each other via @id so crawlers see one connected graph
 * instead of disconnected islands.
 */
export function buildDocJsonLd({
  baseUrl,
  organization,
  project,
  doc,
  slug,
  breadcrumbs,
}: {
  baseUrl: string;
  organization: Organization | null;
  project: Project | null;
  doc: DocContent;
  slug: string;
  breadcrumbs: BreadcrumbItem[];
}) {
  const seo = doc.seo || {};
  const pageUrl = `${baseUrl}/${slug}`;
  const orgId = `${baseUrl}/#organization`;
  const websiteId = `${baseUrl}/#website`;
  const webpageId = `${pageUrl}#webpage`;
  const breadcrumbId = `${pageUrl}#breadcrumb`;
  const imageId = `${pageUrl}#primaryimage`;
  const articleId = `${pageUrl}#article`;

  const title = seo.metaTitle || stripTitleHTML(doc.title);
  const description = seo.metaDescription || doc.description || project?.description || undefined;

  // A project can override the shared org identity per-field (see
  // project.metadata.organization); any field left unset falls back to the
  // instance-wide default from the Settings page.
  const orgOverride = project?.metadata?.organization;
  const orgName = orgOverride?.name || organization?.name || project?.name || "Documentation";
  const orgLogo = orgOverride?.logo || organization?.logo || undefined;
  const orgUrl = orgOverride?.url || organization?.url || baseUrl;

  // Social preview image prefers the project's own site logo over the org
  // logo — a docs site's branding usually differs from the parent company's.
  const ogImage = seo.ogImage || project?.metadata?.logo || orgLogo;
  const schemaType = SCHEMA_TYPES.includes(seo.schemaType as any) ? seo.schemaType : "Article";

  const graph: Record<string, unknown>[] = [
    {
      "@type": "Organization",
      "@id": orgId,
      name: orgName,
      url: orgUrl,
      ...(orgLogo && {
        logo: {
          "@type": "ImageObject",
          "@id": `${baseUrl}/#logo`,
          url: orgLogo,
          contentUrl: orgLogo,
        },
      }),
    },
    {
      "@type": "WebSite",
      "@id": websiteId,
      url: baseUrl,
      name: orgName,
      publisher: { "@id": orgId },
    },
    {
      "@type": "WebPage",
      "@id": webpageId,
      url: pageUrl,
      name: title,
      ...(description && { description }),
      isPartOf: { "@id": websiteId },
      breadcrumb: { "@id": breadcrumbId },
      ...(ogImage && { primaryImageOfPage: { "@id": imageId } }),
      ...(doc.createdAt && { datePublished: doc.createdAt }),
      ...(doc.updatedAt && { dateModified: doc.updatedAt }),
    },
    ...(ogImage
      ? [
          {
            "@type": "ImageObject",
            "@id": imageId,
            url: ogImage,
            contentUrl: ogImage,
          },
        ]
      : []),
    {
      "@type": schemaType,
      "@id": articleId,
      headline: title,
      ...(description && { description }),
      ...(ogImage && { image: { "@id": imageId } }),
      ...(doc.createdAt && { datePublished: doc.createdAt }),
      ...(doc.updatedAt && { dateModified: doc.updatedAt }),
      author: { "@id": orgId },
      publisher: { "@id": orgId },
      mainEntityOfPage: { "@id": webpageId },
      isPartOf: { "@id": webpageId },
    },
    {
      "@type": "BreadcrumbList",
      "@id": breadcrumbId,
      itemListElement: breadcrumbs.map((crumb, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: crumb.title,
        ...(crumb.href
          ? { item: crumb.href === "/" ? baseUrl : `${baseUrl}${crumb.href}` }
          : { item: pageUrl }),
      })),
    },
  ];

  return {
    "@context": "https://schema.org",
    "@graph": graph,
  };
}
