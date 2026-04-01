import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Client } from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
console.log("NEON_DATABASE_URL loaded:", !!process.env.NEON_DATABASE_URL);

function findDbDir() {
  const candidates = [
    path.resolve(process.cwd(), "packages/web/db"),
    path.resolve(process.cwd(), "db"),
    __dirname,
  ];

  for (const dir of candidates) {
    if (!fs.existsSync(dir)) continue;
    const sqlFiles = fs.readdirSync(dir).filter((f) => f.endsWith(".sql"));
    if (sqlFiles.length > 0) return dir;
  }

  throw new Error(`No .sql files found. Checked:\n${candidates.join("\n")}`);
}

async function run() {
  if (!process.env.NEON_DATABASE_URL) {
    throw new Error("NEON_DATABASE_URL is not set");
  }

  const parsed = new URL(process.env.NEON_DATABASE_URL);
  console.log("DB host:", parsed.hostname);
  console.log("DB name:", parsed.pathname.replace("/", ""));

  const dbDir = findDbDir();
  const files = fs
    .readdirSync(dbDir)
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  console.log("Using db directory:", dbDir);
  console.log("SQL files found:", files);

  const client = new Client({ connectionString: process.env.NEON_DATABASE_URL });
  await client.connect();
  console.log("Connected to database");

  try {
    // Ensure migration tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        filename   VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Load already-applied migrations
    const { rows } = await client.query("SELECT filename FROM _migrations");
    const applied = new Set(rows.map((r) => r.filename));

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`Skipping ${file} (already applied)`);
        continue;
      }

      const sql = fs.readFileSync(path.join(dbDir, file), "utf8").trim();
      if (!sql) continue;

      console.log(`Running ${file}...`);
      await client.query(sql);
      await client.query("INSERT INTO _migrations (filename) VALUES ($1)", [file]);
      console.log(`Done: ${file}`);
    }

    console.log("All migrations completed successfully.");
  } finally {
    await client.end();
    console.log("Database connection closed.");
  }
}

run().catch((err) => {
  console.error("Migration failed:");
  console.error(err);
  process.exit(1);
});
