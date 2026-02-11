#!/usr/bin/env tsx

/**
 * Knowledge Base Sync Script
 *
 * This script syncs all knowledge bases from the GitHub repository
 * and caches them locally for better performance.
 *
 * Usage:
 *   npm run sync-kb
 *   or
 *   pnpm sync-kb
 */

import dotenv from "dotenv";
import path from "path";

// Load environment variables from .env.local
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import { syncAllKnowledgeBases, clearKnowledgeBaseCache } from "../lib/github-kb-fetcher";

async function main() {
  const args = process.argv.slice(2);
  const shouldClear = args.includes("--clear") || args.includes("-c");

  console.log("═══════════════════════════════════════");
  console.log("  Knowledge Base Sync Script");
  console.log("═══════════════════════════════════════\n");

  if (shouldClear) {
    console.log("🗑️  Clearing existing cache...");
    clearKnowledgeBaseCache();
    console.log("✓ Cache cleared\n");
  }

  console.log("🔄 Syncing knowledge bases from GitHub...\n");
  console.log("Repository: themegrill/knowledge-base");
  console.log("Branch: main\n");

  try {
    await syncAllKnowledgeBases();
    console.log("\n✅ Sync complete!");
    console.log("\nThe knowledge bases are now cached and ready to use.");
    console.log("The cache will be used for 1 hour before checking GitHub again.\n");
  } catch (error) {
    console.error("\n❌ Sync failed:");
    console.error(error);
    process.exit(1);
  }
}

main();
