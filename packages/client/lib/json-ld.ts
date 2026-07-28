import type { DocContent, NavRoute, Organization, Project } from "@/lib/api";
import type { BreadcrumbItem } from "@/components/docs/Breadcrumb";
import { stripTitleHTML } from "@/lib/parse-title-badges";

const SCHEMA_TYPES = ["Article", "TechArticle", "HowTo", "FAQPage"] as const;

function buildOrganizationId(
  baseUrl: string,
  project: Project | null,
  organization: Organization | null
): string {
  const projectOrganizationUrl = project?.metadata?.organization?.url?.trim();
  if (projectOrganizationUrl) {
    return `${projectOrganizationUrl.replace(/\/+$/, "")}/#organization`;
  }
  return organization?.organizationId?.trim() || `${baseUrl.replace(/\/+$/, "")}/#organization`;
}

export function buildHomeJsonLd({
  baseUrl,
  organization,
  project,
  sections,
}: {
  baseUrl: string;
  organization: Organization | null;
  project: Project;
  sections: NavRoute[];
}) {
  const orgOverride = project.metadata?.organization;
  const organizationId = buildOrganizationId(baseUrl, project, organization);
  const organizationUrl = orgOverride?.url?.trim() || organization?.url?.trim();
  const websiteId = `${baseUrl}/#website`;
  const homepageId = `${baseUrl}/#webpage`;
  const organizationName =
    orgOverride?.name || organization?.name || project.name || "Documentation";
  const organizationLogo = orgOverride?.logo || organization?.logo || project.metadata?.logo;

  const sectionItems = sections
    .map((section, index) => {
      const slug =
        section.slug || section.path?.replace(/^\/docs\//, "").replace(/^\/+|\/+$/g, "");
      if (!slug) return null;
      return {
        "@type": "ListItem",
        position: index + 1,
        name: stripTitleHTML(section.title),
        url: new URL(`/${slug}`, baseUrl).toString(),
      };
    })
    .filter(Boolean);

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": organizationId,
        name: organizationName,
        ...(organizationUrl && { url: organizationUrl }),
        ...(organizationLogo && {
          logo: {
            "@type": "ImageObject",
            url: new URL(organizationLogo, baseUrl).toString(),
          },
        }),
      },
      {
        "@type": "WebSite",
        "@id": websiteId,
        url: baseUrl,
        name: project.name,
        ...(project.description && { description: project.description }),
        publisher: { "@id": organizationId },
      },
      {
        "@type": "CollectionPage",
        "@id": homepageId,
        url: baseUrl,
        name: `${project.name} Documentation`,
        ...(project.description && { description: project.description }),
        isPartOf: { "@id": websiteId },
        about: { "@id": organizationId },
        ...(sectionItems.length > 0 && {
          mainEntity: {
            "@type": "ItemList",
            itemListElement: sectionItems,
          },
        }),
      },
    ],
  };
}

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
  const orgId = buildOrganizationId(baseUrl, project, organization);
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

  // Social preview image prefers the project's own dedicated OG image, then
  // its logo, over the org logo — a docs site's branding usually differs
  // from the parent company's.
  const ogImage = seo.ogImage || project?.metadata?.ogImage || project?.metadata?.logo || orgLogo;
  const schemaType = SCHEMA_TYPES.includes(seo.schemaType as any) ? seo.schemaType : "Article";

  // The Organization entity is referenced by @id. The current project's
  // organization URL is canonical; the instance-wide organization ID and a
  // local docs-site ID are fallbacks for projects without that setting.
  const graph: Record<string, unknown>[] = [
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
