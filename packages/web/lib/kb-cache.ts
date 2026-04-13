/**
 * Server-side in-memory cache for formatted knowledge base prompts.
 *
 * Why this exists:
 *   Every doc-chat request previously hit the database to load KB content,
 *   then assembled a large prompt string on every turn. This module caches
 *   the assembled prompt so the DB is only queried once after each KB update.
 *
 * Invalidation:
 *   Call `invalidateKbCache(projectSlug)` immediately after any route that
 *   writes to `project_knowledge_bases`. The next chat request will then
 *   reload from the DB and repopulate the cache.
 *
 * Lifetime:
 *   The cache lives in the Node.js module scope. It survives across requests
 *   within the same server process but is cleared on cold starts / deploys,
 *   which is fine — the first request after a cold start pays the DB cost.
 */

interface KbCacheEntry {
  prompt: string;
  cachedAt: number;
}

const cache = new Map<string, KbCacheEntry>();

export function getCachedKbPrompt(projectSlug: string): string | null {
  const entry = cache.get(projectSlug);
  if (!entry) return null;
  return entry.prompt;
}

export function setCachedKbPrompt(projectSlug: string, prompt: string): void {
  cache.set(projectSlug, { prompt, cachedAt: Date.now() });
}

/**
 * Immediately removes the cached prompt for a project.
 * Must be called after any write to `project_knowledge_bases` for this project.
 */
export function invalidateKbCache(projectSlug: string): void {
  const existed = cache.delete(projectSlug);
  if (existed) {
    console.log(`[KB Cache] Invalidated cache for project: ${projectSlug}`);
  }
}
