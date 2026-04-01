#!/usr/bin/env node
/**
 * sync-client.js
 *
 * Syncs client-facing source files from packages/web → packages/client.
 * Run this after making changes to any of the listed paths.
 *
 * Usage:
 *   node packages/web/scripts/sync-client.js           # sync all
 *   node packages/web/scripts/sync-client.js --dry-run # preview only
 *
 * Or via package.json script from packages/client:
 *   pnpm sync
 */

const fs = require("fs");
const path = require("path");

const isDryRun = process.argv.includes("--dry-run");

const ROOT = path.resolve(__dirname, "../../..");
const SRC = path.join(ROOT, "packages/web");
const DST = path.join(ROOT, "packages/client");

/**
 * Paths to sync from packages/web → packages/client (preserving directory structure).
 * Directories are synced recursively; individual files are synced directly.
 *
 * Add new entries here when you create client-side files in packages/web
 * that should also be available in the standalone client package.
 */
const SYNC_PATHS = [
  // Read-only doc viewer components
  // Client-specific (NOT synced): DocsLayoutClient, DocRenderer, DocRendererClient, Sidebar, SectionPage
  "components/docs/SearchDialog.tsx",
  // TableOfContents is client-specific (no editing-mode concept in read-only viewer)
  // Shared UI primitives
  "components/ui",
  // Shared utility functions
  "lib/utils.ts",
  "lib/parse-title-badges.ts",
];

// ─── helpers ─────────────────────────────────────────────────────────────────

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    if (!isDryRun) fs.mkdirSync(dirPath, { recursive: true });
  }
}

function copyFile(src, dst) {
  const srcStat = fs.statSync(src);
  const dstExists = fs.existsSync(dst);
  const dstStat = dstExists ? fs.statSync(dst) : null;

  // Skip if destination is already up-to-date (same mtime + size)
  if (dstStat && srcStat.mtimeMs <= dstStat.mtimeMs && srcStat.size === dstStat.size) {
    return "unchanged";
  }

  ensureDir(path.dirname(dst));
  if (!isDryRun) fs.copyFileSync(src, dst);
  return dstExists ? "updated" : "created";
}

function syncPath(relPath) {
  const src = path.join(SRC, relPath);
  const dst = path.join(DST, relPath);

  if (!fs.existsSync(src)) {
    console.warn(`  [WARN] Source not found, skipping: ${relPath}`);
    return;
  }

  const stat = fs.statSync(src);

  if (stat.isDirectory()) {
    syncDir(src, dst, relPath);
  } else {
    const status = copyFile(src, dst);
    if (status !== "unchanged") {
      console.log(`  [${status.toUpperCase()}] ${relPath}`);
    }
  }
}

function syncDir(srcDir, dstDir, displayPrefix) {
  ensureDir(dstDir);

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcEntry = path.join(srcDir, entry.name);
    const dstEntry = path.join(dstDir, entry.name);
    const rel = path.join(displayPrefix, entry.name);

    if (entry.isDirectory()) {
      syncDir(srcEntry, dstEntry, rel);
    } else {
      const status = copyFile(srcEntry, dstEntry);
      if (status !== "unchanged") {
        console.log(`  [${status.toUpperCase()}] ${rel}`);
      }
    }
  }
}

// ─── main ─────────────────────────────────────────────────────────────────────

console.log(`\nSync: packages/web → packages/client${isDryRun ? " (dry run)" : ""}\n`);

const origLog = console.log.bind(console);
let loggedLines = 0;

// Count changed lines
console.log = (...args) => {
  origLog(...args);
  if (args[0] && typeof args[0] === "string" && args[0].startsWith("  [")) {
    loggedLines++;
  }
};

for (const relPath of SYNC_PATHS) {
  syncPath(relPath);
}

console.log = origLog;

if (loggedLines === 0) {
  console.log("  All files up-to-date.\n");
} else {
  console.log(`\n  ${loggedLines} file(s) synced.\n`);
}
