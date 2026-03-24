#!/usr/bin/env tsx

/**
 * Make a user a system admin
 */

import { getDb } from "../../lib/db/postgres";

async function makeAdmin() {
  const sql = getDb();

  try {
    const email = process.argv[2];

    if (!email) {
      console.error("❌ Please provide user email:");
      console.error("   pnpm tsx scripts/make-admin.ts user@email.com");
      process.exit(1);
    }

    console.log(`🔍 Finding user: ${email}\n`);

    // Get user
    const [user] = await sql`
      SELECT id, email, name, role FROM users WHERE email = ${email}
    `;

    if (!user) {
      console.error(`❌ User not found: ${email}`);
      process.exit(1);
    }

    console.log(`✅ User found: ${user.name || user.email}`);
    console.log(`   Current role: ${user.role}`);

    if (user.role === "super_admin") {
      console.log(`\n✅ User is already a super_admin!`);
      process.exit(0);
    }

    console.log(`\n🔧 Updating to super_admin...`);

    // Update user role
    await sql`
      UPDATE users
      SET role = 'super_admin'
      WHERE id = ${user.id}
    `;

    console.log(`✅ User updated to super_admin!`);
    console.log(`\n🎉 ${user.email} now has full system access:`);
    console.log(`   ✓ Can access Users page`);
    console.log(`   ✓ Can create/edit/delete users`);
    console.log(`   ✓ Can manage all projects`);

    process.exit(0);
  } catch (error: any) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

makeAdmin();
