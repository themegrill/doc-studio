/**
 * Prebuild migration: ensure the soft-delete columns exist on `documents`.
 *
 * Runs before `next build` (see package.json "build"). It is fully idempotent
 * (ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS), so it is safe to run
 * on every deploy and does nothing once the columns are in place.
 *
 * Uses DATABASE_URL — the same connection string the app uses at runtime — and
 * skips quietly if it is not available at build time.
 */
import postgres from "postgres";

const url = process.env.DATABASE_URL;

if (!url) {
  console.warn("[migrate] DATABASE_URL not set — skipping soft-delete migration");
  process.exit(0);
}

// Silence "already exists, skipping" NOTICEs — expected on repeat runs.
const sql = postgres(url, { max: 1, onnotice: () => {} });

try {
  await sql.unsafe(`
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_documents_deleted_at ON documents(deleted_at);
  `);
  console.log("[migrate] soft-delete columns ensured");
} catch (err) {
  console.error("[migrate] failed to ensure soft-delete columns:", err);
  process.exit(1);
} finally {
  await sql.end();
}
