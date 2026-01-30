// Simple script to test database connection
// Run with: node packages/web/db/test-connection.js

const postgres = require("postgres");

const sql = postgres(
  process.env.DATABASE_URL ||
    "postgres://tg_docs_user:tg_docs_password@localhost:5432/tg_docs_db",
);

async function testConnection() {
  try {
    console.log("Testing database connection...");

    // Test basic query
    const result = await sql`SELECT NOW() as current_time`;
    console.log("✓ Database connected successfully!");
    console.log("  Current time:", result[0].current_time);

    // Check tables
    const tables = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;
    console.log("\n✓ Available tables:");
    tables.forEach((table) => {
      console.log(`  - ${table.table_name}`);
    });

    // Count records
    const [docCount] = await sql`SELECT COUNT(*) as count FROM documents`;
    const [navCount] = await sql`SELECT COUNT(*) as count FROM navigation`;
    const [userCount] = await sql`SELECT COUNT(*) as count FROM users`;

    console.log("\n✓ Record counts:");
    console.log(`  - Documents: ${docCount.count}`);
    console.log(`  - Navigation: ${navCount.count}`);
    console.log(`  - Users: ${userCount.count}`);

    await sql.end();
    console.log("\n✓ Test completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("✗ Database connection failed:");
    console.error(error.message);
    process.exit(1);
  }
}

testConnection();
