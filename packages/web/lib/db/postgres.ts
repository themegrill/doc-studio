import postgres from "postgres";

// Connection string format: postgres://user:password@host:port/database
const connectionString =
  process.env.DATABASE_URL ||
  "postgres://tg_docs_user:tg_docs_password@localhost:5432/tg_docs_db";

// Create a singleton connection
let sql: ReturnType<typeof postgres> | null = null;

export function getDb() {
  if (!sql) {
    sql = postgres(connectionString, {
      max: 10, // Maximum number of connections
      idle_timeout: 20, // Close idle connections after 20 seconds
      connect_timeout: 10, // Connection timeout in seconds
    });
  }
  return sql;
}

// Helper to close the connection (useful for serverless or cleanup)
export async function closeDb() {
  if (sql) {
    await sql.end();
    sql = null;
  }
}
