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

  const doc = await getDoc(slug);

  if (doc) {
    return <DocRendererClient doc={doc} slug={slug} projectSlug={PROJECT_SLUG} />;
  }

  // No document found — check if the slug matches a section in the navigation
  if (!slug.includes("/")) {
    const navigation = await getNavigation();
    const sectionPath = `/docs/${slug}`;

    const section = navigation?.routes?.find((route) => {
      // Section with its own overview page
      if (route.path === sectionPath) return true;
      // Category section: children have paths like /docs/slug/child
      if (route.children && route.children.length > 0) {
        if (route.children.some((c) => c.path?.startsWith(`/docs/${slug}/`))) return true;
        // Legacy: first child path directly matches (old format)
        const firstChildPath = route.children[0].path;
        if (firstChildPath === sectionPath) return true;
      }
      // Fallback: match by slugifying the section title
      const titleSlug = route.title
        .toLowerCase()
        .replace(/<[^>]*>/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      return titleSlug === slug;
    });

    if (section) {
      const childDocs =
        section.children?.map((child) => ({
          id: child.id ?? child.slug ?? child.path ?? "",
          title: child.title,
          slug: child.path?.replace(/^\/docs\//, "") ?? child.slug ?? "",
        })) ?? [];

      return (
        <SectionPage
          projectSlug={PROJECT_SLUG}
          sectionSlug={slug}
          sectionTitle={section.title}
          childDocs={childDocs}
        />
      );
    }
  }

  notFound();
}

export const dynamic = "force-dynamic";
