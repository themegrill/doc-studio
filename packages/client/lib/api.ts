/**
 * Server-side API helpers for fetching data from the main doc-studio app.
 * Used by Next.js server components (layout.tsx, page.tsx).
 */

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:3000";
const PROJECT_SLUG = process.env.PROJECT_SLUG || "default";

export { PROJECT_SLUG };

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

export interface SeoData {
  metaTitle?: string;
  metaDescription?: string;
  schemaType?: "Article" | "TechArticle" | "HowTo" | "FAQPage";
  canonicalUrl?: string;
  robots?: {
    index?: boolean;
    follow?: boolean;
    maxSnippet?: number;
    maxVideoPreview?: number;
    maxImagePreview?: "none" | "standard" | "large";
  };
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogImageAlt?: string;
  twitterCard?: "summary" | "summary_large_image";
  focusKeyword?: string;
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
  seo?: SeoData;
}

export interface Project {
  name: string;
  slug: string;
  description?: string;
  metadata?: { logo?: string; favicon?: string; [key: string]: any };
}

export async function getProject(): Promise<Project | null> {
  try {
    const res = await fetch(
      `${API_BASE_URL}/api/projects/${PROJECT_SLUG}`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function getNavigation(): Promise<Navigation | null> {
  try {
    const res = await fetch(
      `${API_BASE_URL}/api/navigation?projectSlug=${PROJECT_SLUG}`,
      { cache: "no-store" }
    );

    if (!res.ok) return null;
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
    const res = await fetch(
      `${API_BASE_URL}/api/projects/${PROJECT_SLUG}/integrations`,
      { next: { revalidate: 300 } }
    );
    if (!res.ok) return {};
    const { integrations } = await res.json();
    return integrations ?? {};
  } catch {
    return {};
  }
}

export async function getDoc(slug: string): Promise<DocContent | null> {
  try {
    const res = await fetch(
      `${API_BASE_URL}/api/docs/${slug}?projectSlug=${PROJECT_SLUG}`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
