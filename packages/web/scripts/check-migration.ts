#!/usr/bin/env tsx

import { getDb } from "../lib/db/postgres";

async function checkMigration() {
  const sql = getDb();

  try {
    console.log("🔍 Checking if role column exists...\n");

    // Check if role column exists
    const columns = await sql`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'role'
    `;

    if (columns.length > 0) {
      console.log("✅ Role column exists!");
      console.log("   - Column:", columns[0].column_name);
      console.log("   - Type:", columns[0].data_type);
      console.log("   - Default:", columns[0].column_default);
      console.log("\n");
    } else {
      console.log("❌ Role column NOT found!");
      console.log("Run: pnpm db:migrate");
      process.exit(1);
    }

    // Show users with roles
    const users = await sql`
      SELECT id, email, name, role FROM users LIMIT 10
    `;

    console.log("👥 Users in database:");
    if (users.length === 0) {
      console.log("   No users found");
    } else {
      users.forEach((user) => {
        console.log(`   - ${user.email || 'no-email'}: ${user.role} (${user.name || 'unnamed'})`);
      });
    }

    console.log("\n✅ Migration verified successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

checkMigration();
