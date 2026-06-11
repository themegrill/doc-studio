import { getDb } from "../../lib/db/postgres";

async function run() {
  const sql = getDb();
  await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS redirects JSONB DEFAULT '[]'::jsonb`;
  console.log("✅ redirects column added to projects");
  process.exit(0);
}

run();
