import { notFound } from "next/navigation";
import DocRendererClient from "@/components/docs/DocRendererClient";
import SectionPage from "@/components/docs/SectionPage";
import { getDoc, getNavigation, PROJECT_SLUG } from "@/lib/api";
import type { Navigation } from "@/lib/api";
import { stripTitleHTML } from "@/lib/parse-title-badges";
import type { BreadcrumbItem } from "@/components/docs/Breadcrumb";

function buildBreadcrumbs(
  slug: string,
  navigation: Navigation | null,
  docTitle: string
): BreadcrumbItem[] {
  const crumbs: BreadcrumbItem[] = [{ title: "Home", href: "/" }];

  if (navigation && slug.includes("/")) {
    const sectionSlug = slug.split("/")[0];
    const sectionPath = `/docs/${sectionSlug}`;

    const section = navigation.routes.find((route) => {
      if (route.path === sectionPath || route.slug === sectionSlug) return true;
      if (
        route.children?.some((c) => {
          const childSlug = c.path?.replace(/^\/docs\//, "") ?? c.slug ?? "";
          return childSlug.startsWith(sectionSlug + "/") || childSlug === sectionSlug;
        })
      )
        return true;
      const titleSlug = route.title
        .toLowerCase()
        .replace(/<[^>]*>/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      return titleSlug === sectionSlug;
    });

    if (section) {
      crumbs.push({
        title: stripTitleHTML(section.title),
        href: `/${sectionSlug}`,
      });
    }
  }

  crumbs.push({ title: stripTitleHTML(docTitle) }); // active — no href
  return crumbs;
}

export default async function DocPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const resolvedParams = await params;
  const slug = resolvedParams.slug.join("/");

  // Always fetch navigation — needed for section check and breadcrumbs
  const navigation = await getNavigation();

  // For single-segment slugs, check if it matches a navigation section first.
  // Section pages take priority over documents with the same slug.
  if (!slug.includes("/")) {
    const sectionPath = `/docs/${slug}`;

    const section = navigation?.routes?.find((route) => {
      if (route.path === sectionPath) return true;
      if (route.children && route.children.length > 0) {
        if (route.children.some((c) => c.path?.startsWith(`/docs/${slug}/`))) return true;
        const firstChildPath = route.children[0].path;
        if (firstChildPath === sectionPath) return true;
      }
      const titleSlug = route.title
        .toLowerCase()
        .replace(/<[^>]*>/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      return titleSlug === slug;
    });

    if (section) {
      const rawChildren = section.children ?? [];
      const [sectionDoc, ...childDocResults] = await Promise.all([
        getDoc(slug),
        ...rawChildren.map(async (child) => {
          const childSlug = child.path?.replace(/^\/docs\//, "") ?? child.slug ?? "";
          const doc = childSlug ? await getDoc(childSlug) : null;
          if (!doc) return null;
          return {
            id: child.id ?? child.slug ?? child.path ?? "",
            title: child.title,
            slug: childSlug,
            description: doc.description,
          };
        }),
      ]);

      const publishedChildren = childDocResults.filter((d) => d !== null);

      return (
        <>
          {sectionDoc && (
            <DocRendererClient
              doc={sectionDoc}
              slug={slug}
              projectSlug={PROJECT_SLUG}
              breadcrumbs={buildBreadcrumbs(slug, navigation, sectionDoc.title)}
            />
          )}
          <SectionPage
            projectSlug={PROJECT_SLUG}
            sectionSlug={slug}
            sectionTitle={section.title}
            hideTitle={!!sectionDoc}
            childDocs={publishedChildren}
			sectionDescription={section.description}
          />
        </>
      );
    }
  }

  // Fall back to document rendering
  const doc = await getDoc(slug);

  if (doc) {
    return (
      <DocRendererClient
        doc={doc}
        slug={slug}
        projectSlug={PROJECT_SLUG}
        breadcrumbs={buildBreadcrumbs(slug, navigation, doc.title)}
      />
    );
  }

  notFound();
}

export const dynamic = "force-dynamic";
