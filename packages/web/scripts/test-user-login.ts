#!/usr/bin/env tsx

/**
 * Test if a user's password is set correctly and can authenticate
 */

import { getDb } from "../lib/db/postgres";
import bcrypt from "bcryptjs";

async function testUserLogin() {
  const sql = getDb();

  try {
    const email = process.argv[2];
    const password = process.argv[3];

    if (!email || !password) {
      console.error("❌ Please provide email and password:");
      console.error("   pnpm tsx scripts/test-user-login.ts user@email.com password123");
      process.exit(1);
    }

    console.log(`🔍 Testing login for: ${email}\n`);

    // Get user
    const [user] = await sql`
      SELECT id, email, name, hashed_password
      FROM users
      WHERE email = ${email}
    `;

    if (!user) {
      console.error(`❌ User not found: ${email}`);
      process.exit(1);
    }

    console.log(`✅ User found:`);
    console.log(`   - ID: ${user.id}`);
    console.log(`   - Email: ${user.email}`);
    console.log(`   - Name: ${user.name || '(not set)'}`);
    console.log(`   - Has password: ${user.hashed_password ? 'YES' : 'NO'}`);

    if (!user.hashed_password) {
      console.error(`\n❌ User has no password set!`);
      console.error(`   Run this to set a password:`);
      console.error(`   UPDATE users SET hashed_password = '...' WHERE id = '${user.id}';`);
      process.exit(1);
    }

    console.log(`   - Hashed password: ${user.hashed_password.substring(0, 20)}...`);

    // Test password
    console.log(`\n🔐 Testing password: "${password}"`);
    const passwordMatch = await bcrypt.compare(password, user.hashed_password);

    if (passwordMatch) {
      console.log(`✅ Password MATCHES! Login should work.`);
    } else {
      console.log(`❌ Password DOES NOT MATCH!`);
      console.log(`\nPossible issues:`);
      console.log(`   1. Wrong password`);
      console.log(`   2. Password wasn't hashed correctly when saved`);
      console.log(`   3. Password hash is corrupted`);
      console.log(`\n💡 Try setting a new password for this user via Edit User dialog.`);
    }

    process.exit(0);
  } catch (error: any) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

testUserLogin();
