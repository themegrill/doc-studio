/**
 * Server-side in-memory KB prompt cache.
 *
 * On Vercel this is per-instance (not shared across serverless instances),
 * but that's acceptable — the main cost saving comes from Anthropic-side
 * prompt caching, which is content-based and works across all instances.
 * This cache is a secondary optimization that reduces DB queries within a
 * warm instance session.
 *
 * Invalidation: call `invalidateKbCache(projectSlug)` after any write to
 * `project_knowledge_bases`. On the same instance it takes effect immediately;
 * other instances will miss and reload from DB on their next request, which
 * is fine — the DB query is a cheap indexed JOIN.
 */

interface KbCacheEntry {
  prompt: string;
  cachedAt: number;
}

const cache = new Map<string, KbCacheEntry>();

export function getCachedKbPrompt(projectSlug: string): string | null {
  return cache.get(projectSlug)?.prompt ?? null;
}

export function setCachedKbPrompt(projectSlug: string, prompt: string): void {
  cache.set(projectSlug, { prompt, cachedAt: Date.now() });
}

export function invalidateKbCache(projectSlug: string): void {
  const existed = cache.delete(projectSlug);
  if (existed) {
    console.log(`[KB Cache] Invalidated cache for project: ${projectSlug}`);
  }
}
