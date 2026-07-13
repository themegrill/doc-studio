import { NextRequest, NextResponse } from "next/server";

interface Redirect {
	from: string;
	to: string;
}

interface RedirectCache {
	redirects: Redirect[];
	fetchedAt: number;
}

const TTL_MS = 5 * 60 * 1000;
let cache: RedirectCache | null = null;

async function getRedirects(
	apiBase: string,
	projectSlug: string,
): Promise<Redirect[]> {
	const now = Date.now();

	if (cache && now - cache.fetchedAt < TTL_MS) {
		return cache.redirects;
	}

	try {
		const res = await fetch(
			`${apiBase}/api/projects/${projectSlug}/redirects`,
			{ cache: "no-store" },
		);

		if (!res.ok) {
			return cache?.redirects ?? [];
		}

		const { redirects } = await res.json();

		cache = {
			redirects: redirects ?? [],
			fetchedAt: now,
		};

		return cache.redirects;
	} catch {
		return cache?.redirects ?? [];
	}
}

function normalizeFrom(raw: string): string {
	return raw.split("?")[0].split("#")[0];
}

export async function middleware(req: NextRequest) {
	const pathname = req.nextUrl.pathname;

	/*
	 * API routes: canonical URL has no trailing slash.
	 *
	 * /api/search  -> unchanged
	 * /api/search/ -> /api/search
	 */
	if (pathname === "/api" || pathname.startsWith("/api/")) {
		if (pathname.endsWith("/") && pathname !== "/") {
			const url = req.nextUrl.clone();

			url.pathname = pathname.replace(/\/+$/, "");

			return NextResponse.redirect(url, 308);
		}

		return NextResponse.next();
	}

	const projectSlug = process.env.PROJECT_SLUG;
	const apiBase = process.env.API_BASE_URL || "http://localhost:3000";

	// Check project-specific redirects only when a project slug exists.
	if (projectSlug) {
		const redirects = await getRedirects(apiBase, projectSlug);

		const match = redirects.find((redirect) => {
			const from = normalizeFrom(redirect.from);

			return (
				from === pathname ||
				from === `${pathname}/` ||
				`${from}/` === pathname
			);
		});

		if (match) {
			const destination = match.to.includes("#")
				? match.to
				: `${match.to}#`;

			return NextResponse.redirect(
				new URL(destination, req.nextUrl.origin),
				301,
			);
		}
	}

	/*
	 * Normal website pages: canonical URL has a trailing slash.
	 *
	 * /about  -> /about/
	 * /about/ -> unchanged
	 */
	if (pathname !== "/" && !pathname.endsWith("/")) {
		const url = req.nextUrl.clone();

		url.pathname = `${pathname}/`;

		return NextResponse.redirect(url, 308);
	}

	return NextResponse.next();
}

export const config = {
	// API must be included so its trailing slash can be removed.
	matcher: ["/((?!_next|favicon.ico|_vercel|.*\\..*).*)"],
};
