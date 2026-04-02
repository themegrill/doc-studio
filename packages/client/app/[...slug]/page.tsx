import { notFound } from "next/navigation";
import DocRendererClient from "@/components/docs/DocRendererClient";
import SectionPage from "@/components/docs/SectionPage";
import { getDoc, getNavigation, PROJECT_SLUG } from "@/lib/api";

export default async function DocPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const resolvedParams = await params;
  const slug = resolvedParams.slug.join("/");

  // For single-segment slugs, check if it matches a navigation section first.
  // Section pages take priority over documents with the same slug.
  if (!slug.includes("/")) {
    const navigation = await getNavigation();
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
          return {
            id: child.id ?? child.slug ?? child.path ?? "",
            title: child.title,
            slug: childSlug,
            description: doc?.description,
          };
        }),
      ]);

      return (
        <>
          {sectionDoc && (
              <DocRendererClient doc={sectionDoc} slug={slug} projectSlug={PROJECT_SLUG} />
          )}
          <SectionPage
            projectSlug={PROJECT_SLUG}
            sectionSlug={slug}
            sectionTitle={section.title}
            hideTitle={!!sectionDoc}
            childDocs={childDocResults}
          />
        </>
      );
    }
  }

  // Fall back to document rendering
  const doc = await getDoc(slug);

  if (doc) {
    return <DocRendererClient doc={doc} slug={slug} projectSlug={PROJECT_SLUG} />;
  }

  notFound();
}

export const dynamic = "force-dynamic";
