import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { getDoc, getNavigation } from "@/lib/api";
import type { NavRoute } from "@/lib/api";

export const dynamic = "force-dynamic";

function collectSlugs(routes: NavRoute[]): string[] {
  const slugs = new Set<string>();

  function visit(route: NavRoute) {
    const slug = route.slug || route.path?.replace(/^\/docs\//, "").replace(/^\/+|\/+$/g, "");
    if (slug) slugs.add(slug);
    route.children?.forEach(visit);
  }

  routes.forEach(visit);
  return [...slugs];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [navigation, requestHeaders] = await Promise.all([getNavigation(), headers()]);
  if (!navigation) return [];

  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host");
  if (!host) return [];

  const protocol =
    requestHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const baseUrl = `${protocol}://${host}`;
  const docs = await Promise.all(collectSlugs(navigation.routes).map((slug) => getDoc(slug)));

  return docs
    .filter(
      (doc): doc is NonNullable<typeof doc> =>
        doc !== null && doc.published !== false && doc.seo?.sitemap?.include !== false
    )
    .map((doc) => ({
      url: new URL(`/${doc.slug}`, baseUrl).toString(),
      lastModified: doc.updatedAt ? new Date(doc.updatedAt) : new Date(),
      changeFrequency: doc.seo?.sitemap?.changeFrequency || "weekly",
      priority: doc.seo?.sitemap?.priority ?? (doc.slug.includes("/") ? 0.7 : 0.9),
    }));
}
