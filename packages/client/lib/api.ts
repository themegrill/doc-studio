/**
 * Server-side API helpers for fetching data from the main doc-studio app.
 * Used by Next.js server components (layout.tsx, page.tsx).
 */

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:3000";
const PROJECT_SLUG = process.env.PROJECT_SLUG || "default";

export { PROJECT_SLUG };

/**
 * Fetch with a few retries and small backoff. On serverless (Vercel) the API
 * function and/or database can cold-start, so the first request after idle may
 * time out or return a transient 5xx. A single failure must NOT drop the whole
 * public site to the "Documentation unavailable" screen — retrying rides out
 * the cold start. 4xx responses are returned as-is (not retried): they are
 * deterministic (e.g. 404 for an unknown slug), not transient.
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit & { next?: { revalidate?: number } },
  retries = 3,
): Promise<Response | null> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, init);
      // Retry only on server errors (transient); return client errors directly.
      if (res.ok || (res.status >= 400 && res.status < 500)) return res;
      lastError = new Error(`HTTP ${res.status}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < retries) {
      // 300ms, 600ms, 900ms — enough for a DB/function to wake up.
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
    }
  }
  console.error(`fetchWithRetry gave up for ${url}:`, lastError);
  return null;
}

export interface NavRoute {
  id?: string;
  title: string;
  path?: string;
  slug?: string;
  children?: NavRoute[];
  orderIndex?: number;
}

export interface Navigation {
  id?: string;
  title: string;
  version: string;
  routes: NavRoute[];
}

export interface Block {
  id: string;
  type: string;
  props?: any;
  content?: any[];
  children?: Block[];
}

export interface DocContent {
  id?: string;
  slug: string;
  title: string;
  description?: string;
  blocks: Block[];
  published?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Project {
  name: string;
  slug: string;
  description?: string;
  metadata?: { logo?: string; favicon?: string; [key: string]: any };
}

export async function getProject(): Promise<Project | null> {
  try {
    const res = await fetchWithRetry(
      `${API_BASE_URL}/api/projects/${PROJECT_SLUG}`,
      { next: { revalidate: 60 } }
    );
    if (!res || !res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function getNavigation(): Promise<Navigation | null> {
  try {
    const res = await fetchWithRetry(
      `${API_BASE_URL}/api/navigation?projectSlug=${PROJECT_SLUG}`,
      { next: { revalidate: 60 } }
    );

    if (!res || !res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export interface Integrations {
  crispWebsiteId?: string;
  ga4MeasurementId?: string;
  googleSiteVerification?: string;
  microsoftClarityId?: string;
  customHeadCode?: string;
  customBodyCode?: string;
}

export async function getIntegrations(): Promise<Integrations> {
  try {
    const res = await fetchWithRetry(
      `${API_BASE_URL}/api/projects/${PROJECT_SLUG}/integrations`,
      { next: { revalidate: 300 } }
    );
    if (!res || !res.ok) return {};
    const { integrations } = await res.json();
    return integrations ?? {};
  } catch {
    return {};
  }
}

export async function getDoc(slug: string): Promise<DocContent | null> {
  try {
    const res = await fetchWithRetry(
      `${API_BASE_URL}/api/docs/${slug}?projectSlug=${PROJECT_SLUG}`,
      { next: { revalidate: 30 } }
    );
    if (!res || !res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
