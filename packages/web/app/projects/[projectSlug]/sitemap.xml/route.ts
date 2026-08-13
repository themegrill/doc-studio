import { NextResponse } from "next/server";
import { ContentManager } from "@/lib/db/ContentManager";
import { getProjectBySlug } from "@/lib/project-helpers";

/**
 * Per-project sitemap.
 *
 * This is a plain Route Handler rather than Next's `sitemap.ts` metadata
 * convention, because that convention cannot see route params. Next compiles a
 * `sitemap.ts` with no `generateSitemaps` export into `GET() { handler() }` —
 * the default export is called with no arguments at all, so the previous
 * `sitemap({ params })` destructured `undefined` and every project's sitemap
 * answered 500. Adding `generateSitemaps` would not have helped either: it
 * passes `{ id }`, never the surrounding `[projectSlug]`.
 *
 * A Route Handler receives params normally, at the cost of serialising the XML
 * here — which `renderSitemap` below does.
 */

function getBaseUrl(): string {
  return (
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000"
  );
}

/** Escape the five XML entities. Slugs are tame, but project domains are free text. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

type SitemapEntry = {
  url: string;
  lastModified: Date;
  changeFrequency: string;
  priority: number;
};

function renderSitemap(entries: SitemapEntry[]): string {
  const urls = entries
    .map(
      (entry) => `  <url>
    <loc>${escapeXml(entry.url)}</loc>
    <lastmod>${entry.lastModified.toISOString()}</lastmod>
    <changefreq>${entry.changeFrequency}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectSlug: string }> }
) {
  const { projectSlug } = await params;

  const project = await getProjectBySlug(projectSlug);
  if (!project) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const cm = ContentManager.create();
  const docs = await cm.listDocs(project.id);

  const baseUrl = getBaseUrl();

  const entries: SitemapEntry[] = docs
    .filter((doc) => doc.seo?.sitemap?.include !== false)
    .map((doc) => ({
      url: project.domain
        ? `https://${project.domain}/docs/${doc.slug}`
        : `${baseUrl}/projects/${projectSlug}/docs/${doc.slug}`,
      lastModified: doc.updatedAt ? new Date(doc.updatedAt) : new Date(),
      changeFrequency: doc.seo?.sitemap?.changeFrequency || "weekly",
      priority: doc.seo?.sitemap?.priority ?? (doc.slug.includes("/") ? 0.7 : 0.9),
    }));

  return new NextResponse(renderSitemap(entries), {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}

export const dynamic = "force-dynamic";
