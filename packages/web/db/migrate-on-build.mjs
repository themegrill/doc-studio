/**
 * Prebuild migrations: bring an already-deployed database up to date.
 *
 * Runs before `next build` (see package.json "build"). Every statement is
 * idempotent (ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS), so it is
 * safe to run on every deploy and does nothing once the schema is in place.
 *
 * Fresh databases get the same schema from the numbered db/*.sql files, which
 * docker-compose mounts into the Postgres init directory. Anything added here
 * must also exist there, and vice versa.
 *
 * Uses DATABASE_URL — the same connection string the app uses at runtime — and
 * skips quietly if it is not available at build time.
 */
import postgres from "postgres";

const url = process.env.DATABASE_URL;

if (!url) {
  console.warn("[migrate] DATABASE_URL not set — skipping migrations");
  process.exit(0);
}

// Each step matches a numbered file in db/. Keep the two in sync.
const steps = [
  {
    name: "soft-delete columns (db/12)",
    sql: `
      ALTER TABLE documents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE documents ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_documents_deleted_at ON documents(deleted_at);
    `,
  },
  {
    name: "editorial guideline indexes (db/13)",
    sql: `
      CREATE INDEX IF NOT EXISTS idx_documents_seo_meta_title
          ON documents ((seo->>'metaTitle'))
          WHERE deleted_at IS NULL AND seo->>'metaTitle' IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_documents_seo_meta_description
          ON documents ((seo->>'metaDescription'))
          WHERE deleted_at IS NULL AND seo->>'metaDescription' IS NOT NULL;
    `,
  },
];

// Silence "already exists, skipping" NOTICEs — expected on repeat runs.
const sql = postgres(url, { max: 1, onnotice: () => {} });

try {
  for (const step of steps) {
    await sql.unsafe(step.sql);
    console.log(`[migrate] ${step.name} ensured`);
  }
} catch (err) {
  console.error("[migrate] failed:", err);
  process.exit(1);
} finally {
  await sql.end();
}
