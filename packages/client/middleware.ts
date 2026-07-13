import { NextRequest, NextResponse } from "next/server";

interface Redirect {
  from: string;
  to: string;
}

interface RedirectCache {
  redirects: Redirect[];
  fetchedAt: number;
}

// Module-level cache — persists within the same Edge worker instance.
// Each client deployment has its own PROJECT_SLUG so this is already project-scoped.
const TTL_MS = 5 * 60 * 1000; // 5 minutes
let cache: RedirectCache | null = null;

async function getRedirects(apiBase: string, projectSlug: string): Promise<Redirect[]> {
  const now = Date.now();

  if (cache && now - cache.fetchedAt < TTL_MS) {
    return cache.redirects;
  }

  try {
    const res = await fetch(
      `${apiBase}/api/projects/${projectSlug}/redirects`,
      { cache: "no-store" }
    );
    if (!res.ok) return cache?.redirects ?? [];
    const { redirects } = await res.json();
    cache = { redirects: redirects ?? [], fetchedAt: now };
    return cache.redirects;
  } catch {
    // Return stale cache if available, otherwise empty
    return cache?.redirects ?? [];
  }
}

/** Strip any #hash and ?query from a stored "from" value so imports with full URLs still match. */
function normalizeFrom(raw: string): string {
  // Remove query string and hash — only the pathname portion matters for matching
  return raw.split("?")[0].split("#")[0];
}

export async function middleware(req: NextRequest) {
  const projectSlug = process.env.PROJECT_SLUG;
  const apiBase = process.env.API_BASE_URL || "http://localhost:3000";

  if (!projectSlug) return NextResponse.next();

  // req.nextUrl.pathname is already stripped of query/hash by the browser —
  // normalize stored "from" values the same way so they always match cleanly.
  const pathname = req.nextUrl.pathname;
  const redirects = await getRedirects(apiBase, projectSlug);

  const match = redirects.find((r) => {
    const from = normalizeFrom(r.from);
    return from === pathname || from === pathname + "/" || from + "/" === pathname;
  });

  if (match) {
    // Build the destination from just the origin + match.to so no query params
    // from the original request bleed through.
    // Append "#" when match.to has no fragment — without an explicit fragment in
    // the Location header, browsers copy the original URL's #hash to the new URL
    // (HTML spec fragment-preservation). An explicit empty fragment prevents this.
    const dest = match.to.includes("#") ? match.to : match.to + "#";
    return NextResponse.redirect(new URL(dest, req.nextUrl.origin), 301);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|api|favicon|_vercel|.*\\..*).*)"],
};