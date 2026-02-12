#!/usr/bin/env tsx

/**
 * Database Migration Runner
 * Runs the user roles migration
 */

import { getDb } from "../lib/db/postgres";

async function runMigration() {
  console.log("🔄 Running database migration...\n");

  const sql = getDb();

  try {
    console.log("⚡ Adding role column to users table...");

    // Add role column
    await sql`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) NOT NULL DEFAULT 'user'
    `;
    console.log("✅ Role column added");

    // Update existing users
    await sql`
      UPDATE users SET role = 'user' WHERE role IS NULL OR role = ''
    `;
    console.log("✅ Updated existing users");

    // Add index
    await sql`
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)
    `;
    console.log("✅ Index created");

    console.log("\n✅ Migration completed successfully!\n");

    // Verify
    const columns = await sql`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'role'
    `;

    if (columns.length > 0) {
      console.log("📊 Migration verified:");
      console.log("   - Column:", columns[0].column_name);
      console.log("   - Type:", columns[0].data_type);
      console.log("   - Default:", columns[0].column_default);
    }

    // Show users
    const users = await sql`
      SELECT id, email, name, role FROM users LIMIT 5
    `;

    if (users.length > 0) {
      console.log("\n👥 Current users:");
      users.forEach((user) => {
        console.log(`   - ${user.email || 'no-email'}: ${user.role}`);
      });
    }

    process.exit(0);
  } catch (error: any) {
    console.error("\n❌ Migration failed:");
    console.error(error.message || error);
    process.exit(1);
  }
}

runMigration();
