#!/usr/bin/env tsx

/**
 * Add current user as owner to all projects where they're not already a member
 */

import { getDb } from "../lib/db/postgres";

async function addMeAsOwner() {
  const sql = getDb();

  try {
    console.log("🔍 Checking your project memberships...\n");

    // Get your user ID (replace with your email)
    const userEmail = process.argv[2];

    if (!userEmail) {
      console.error("❌ Please provide your email address:");
      console.error("   pnpm tsx scripts/add-me-as-owner.ts your@email.com");
      process.exit(1);
    }

    const [user] = await sql`
      SELECT id, email FROM users WHERE email = ${userEmail}
    `;

    if (!user) {
      console.error(`❌ User not found: ${userEmail}`);
      process.exit(1);
    }

    console.log(`✅ Found user: ${user.email}\n`);

    // Get all projects
    const projects = await sql`
      SELECT id, name, slug FROM projects
    `;

    console.log(`📊 Found ${projects.length} projects\n`);

    for (const project of projects) {
      // Check if already a member
      const [existing] = await sql`
        SELECT id, role FROM project_members
        WHERE project_id = ${project.id} AND user_id = ${user.id}
      `;

      if (existing) {
        console.log(`✓ ${project.name}: Already a ${existing.role}`);
      } else {
        // Add as owner
        await sql`
          INSERT INTO project_members (project_id, user_id, role)
          VALUES (${project.id}, ${user.id}, 'owner')
        `;
        console.log(`✅ ${project.name}: Added as owner`);
      }
    }

    console.log("\n✅ Done!");
    process.exit(0);
  } catch (error: any) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

addMeAsOwner();
