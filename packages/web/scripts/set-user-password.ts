#!/usr/bin/env tsx

/**
 * Set a password for a user
 */

import { getDb } from "../lib/db/postgres";
import bcrypt from "bcryptjs";

async function setUserPassword() {
  const sql = getDb();

  try {
    const email = process.argv[2];
    const password = process.argv[3];

    if (!email || !password) {
      console.error("❌ Please provide email and password:");
      console.error("   pnpm tsx scripts/set-user-password.ts user@email.com newpassword123");
      process.exit(1);
    }

    if (password.length < 8) {
      console.error("❌ Password must be at least 8 characters");
      process.exit(1);
    }

    console.log(`🔍 Finding user: ${email}\n`);

    // Get user
    const [user] = await sql`
      SELECT id, email, name FROM users WHERE email = ${email}
    `;

    if (!user) {
      console.error(`❌ User not found: ${email}`);
      process.exit(1);
    }

    console.log(`✅ User found: ${user.name || user.email}`);
    console.log(`\n🔐 Hashing password...`);

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log(`✅ Password hashed`);

    console.log(`\n💾 Updating database...`);

    // Update user
    await sql`
      UPDATE users
      SET hashed_password = ${hashedPassword}
      WHERE id = ${user.id}
    `;

    console.log(`✅ Password set successfully!`);
    console.log(`\n🎉 You can now login with:`);
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${password}`);

    process.exit(0);
  } catch (error: any) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

setUserPassword();
