/**
 * GitHub Knowledge Base Fetcher
 *
 * Fetches knowledge base files from the themegrill/knowledge-base repository
 * and caches them locally for performance.
 */

import fs from "fs";
import path from "path";
import { DocumentationKnowledgeBase } from "@/types/knowledge-base";

const GITHUB_REPO = "themegrill/knowledge-base";
const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_PLUGINS_PATH = "plugins"; // Path to plugins folder in the repo
const CACHE_DIR = path.join(process.cwd(), ".cache", "knowledge-base");
const CACHE_DURATION = 1000 * 60 * 60; // 1 hour

interface KnowledgeBaseCache {
  [pluginName: string]: {
    data: DocumentationKnowledgeBase;
    fetchedAt: number;
  };
}

/**
 * Ensure cache directory exists
 */
function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

/**
 * Get cache file path
 */
function getCacheFilePath(): string {
  return path.join(CACHE_DIR, "knowledge-bases.json");
}

/**
 * Load cache from disk
 */
function loadCache(): KnowledgeBaseCache {
  try {
    const cachePath = getCacheFilePath();
    if (fs.existsSync(cachePath)) {
      const content = fs.readFileSync(cachePath, "utf-8");
      return JSON.parse(content);
    }
  } catch (error) {
    console.error("[KB Cache] Error loading cache:", error);
  }
  return {};
}

/**
 * Save cache to disk
 */
function saveCache(cache: KnowledgeBaseCache) {
  try {
    ensureCacheDir();
    const cachePath = getCacheFilePath();
    fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
  } catch (error) {
    console.error("[KB Cache] Error saving cache:", error);
  }
}

/**
 * Check if cached data is still valid
 */
function isCacheValid(cachedItem: { fetchedAt: number }): boolean {
  return Date.now() - cachedItem.fetchedAt < CACHE_DURATION;
}

/**
 * Map project slug to plugin folder name
 *
 * This function handles slug variations:
 * - "user-registration-pro" -> "user-registration-pro"
 * - "urm" -> "user-registration-pro" (if you have custom mappings)
 */
function mapProjectSlugToPluginName(projectSlug: string): string[] {
  // Common slug variations to try
  const variations = [
    projectSlug,
    projectSlug.replace(/-/g, "_"),
    projectSlug.toLowerCase(),
  ];

  // Add any custom mappings here
  const customMappings: Record<string, string> = {
    urm: "user-registration-pro",
    // Add more custom mappings as needed
    // "short-slug": "full-plugin-name",
  };

  if (customMappings[projectSlug]) {
    variations.unshift(customMappings[projectSlug]);
  }

  return [...new Set(variations)]; // Remove duplicates
}

/**
 * Fetch plugin folders from GitHub repository
 * Looks inside the plugins/ directory
 */
async function fetchPluginFolders(): Promise<string[]> {
  try {
    const url = `${GITHUB_API_BASE}/repos/${GITHUB_REPO}/contents/${GITHUB_PLUGINS_PATH}`;

    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
    };

    // Add GitHub token if available (required for private repos)
    if (process.env.GITHUB_TOKEN) {
      console.log("[GitHub KB] Using authentication token");
      headers["Authorization"] = `token ${process.env.GITHUB_TOKEN}`;
    } else {
      console.log("[GitHub KB] ⚠️  No GitHub token found - this will fail for private repos!");
      console.log("[GitHub KB] Add GITHUB_TOKEN to .env.local");
    }

    console.log(`[GitHub KB] Fetching plugin folders from: ${url}`);
    const response = await fetch(url, { headers });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[GitHub KB] Error response: ${errorBody}`);

      if (response.status === 404) {
        throw new Error(
          `Repository not found (404). Please verify:\n` +
          `  1. Repository URL is correct: https://github.com/${GITHUB_REPO}\n` +
          `  2. Repository exists and you have access\n` +
          `  3. GITHUB_TOKEN is set in .env.local (required for private repos)`
        );
      }

      throw new Error(`GitHub API error: ${response.status}`);
    }

    const contents = (await response.json()) as Array<{
      type: string;
      name: string;
    }>;

    // Filter for directories only
    return contents
      .filter((item) => item.type === "dir")
      .map((item) => item.name);
  } catch (error) {
    console.error("[GitHub KB] Error fetching plugin folders:", error);
    return [];
  }
}

/**
 * Fetch knowledge base from a specific plugin folder
 * Uses GitHub API for private repos (raw URLs don't work for private repos)
 */
async function fetchPluginKnowledgeBase(
  pluginName: string
): Promise<DocumentationKnowledgeBase | null> {
  const fileNames = ["documentation.json", "knowledgebase.json"];

  for (const fileName of fileNames) {
    try {
      // Use GitHub API for private repos
      const apiUrl = `${GITHUB_API_BASE}/repos/${GITHUB_REPO}/contents/${GITHUB_PLUGINS_PATH}/${pluginName}/${fileName}`;

      console.log(`[GitHub KB] Trying: ${fileName} for ${pluginName}`);

      const headers: Record<string, string> = {
        Accept: "application/vnd.github.v3+json",
      };

      if (process.env.GITHUB_TOKEN) {
        headers["Authorization"] = `token ${process.env.GITHUB_TOKEN}`;
      }

      const response = await fetch(apiUrl, { headers });

      if (response.ok) {
        const result = await response.json();

        // GitHub API returns base64-encoded content for files
        if (result.content) {
          const content = Buffer.from(result.content, "base64").toString(
            "utf-8"
          );
          const data = JSON.parse(content);
          console.log(`[GitHub KB] ✓ Found ${fileName} for ${pluginName}`);
          return data as DocumentationKnowledgeBase;
        }
      }
    } catch {
      // Continue to next file name
      continue;
    }
  }

  console.log(`[GitHub KB] No knowledge base file found for ${pluginName}`);
  return null;
}

/**
 * Get knowledge base for a project (with caching)
 */
export async function getKnowledgeBaseFromGitHub(
  projectSlug: string
): Promise<DocumentationKnowledgeBase | null> {
  const cache = loadCache();
  const pluginNameVariations = mapProjectSlugToPluginName(projectSlug);

  console.log(
    `[GitHub KB] Looking for knowledge base for project: ${projectSlug}`
  );
  console.log(`[GitHub KB] Trying plugin names:`, pluginNameVariations);

  // Try each plugin name variation
  for (const pluginName of pluginNameVariations) {
    // Check cache first
    const cached = cache[pluginName];
    if (cached && isCacheValid(cached)) {
      console.log(`[GitHub KB] Using cached data for ${pluginName}`);
      return cached.data;
    }

    // Fetch from GitHub
    const data = await fetchPluginKnowledgeBase(pluginName);
    if (data) {
      console.log(`[GitHub KB] Found knowledge base for ${pluginName}`);

      // Update cache
      cache[pluginName] = {
        data,
        fetchedAt: Date.now(),
      };
      saveCache(cache);

      return data;
    }
  }

  console.log(
    `[GitHub KB] No knowledge base found for project ${projectSlug}`
  );
  return null;
}

/**
 * Sync all knowledge bases from GitHub (for build-time or manual sync)
 */
export async function syncAllKnowledgeBases(): Promise<void> {
  console.log("[GitHub KB] Syncing all knowledge bases from GitHub...");

  const pluginFolders = await fetchPluginFolders();
  console.log(`[GitHub KB] Found ${pluginFolders.length} plugin folders`);

  const cache: KnowledgeBaseCache = {};
  let successCount = 0;

  for (const pluginName of pluginFolders) {
    const data = await fetchPluginKnowledgeBase(pluginName);
    if (data) {
      cache[pluginName] = {
        data,
        fetchedAt: Date.now(),
      };
      successCount++;
      console.log(`[GitHub KB] ✓ Synced ${pluginName}`);
    }
  }

  saveCache(cache);
  console.log(
    `[GitHub KB] Sync complete: ${successCount}/${pluginFolders.length} knowledge bases cached`
  );
}

/**
 * Clear the knowledge base cache
 */
export function clearKnowledgeBaseCache(): void {
  try {
    const cachePath = getCacheFilePath();
    if (fs.existsSync(cachePath)) {
      fs.unlinkSync(cachePath);
      console.log("[GitHub KB] Cache cleared");
    }
  } catch (error) {
    console.error("[GitHub KB] Error clearing cache:", error);
  }
}
