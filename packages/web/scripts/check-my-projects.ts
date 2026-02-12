#!/usr/bin/env tsx

/**
 * Check which projects you have access to and your role in each
 */

import { getDb } from "../lib/db/postgres";

async function checkMyProjects() {
  const sql = getDb();

  try {
    const userEmail = process.argv[2];

    if (!userEmail) {
      console.error("❌ Please provide your email address:");
      console.error("   pnpm tsx scripts/check-my-projects.ts your@email.com");
      process.exit(1);
    }

    console.log(`🔍 Checking projects for: ${userEmail}\n`);

    // Get user
    const [user] = await sql`
      SELECT id, email FROM users WHERE email = ${userEmail}
    `;

    if (!user) {
      console.error(`❌ User not found: ${userEmail}`);
      process.exit(1);
    }

    // Get all projects
    const allProjects = await sql`
      SELECT id, name, slug FROM projects ORDER BY name
    `;

    console.log(`📊 Total projects in database: ${allProjects.length}\n`);

    // Get your memberships
    const myProjects = await sql`
      SELECT
        p.id,
        p.name,
        p.slug,
        pm.role,
        pm.created_at
      FROM projects p
      INNER JOIN project_members pm ON p.id = pm.project_id
      WHERE pm.user_id = ${user.id}
      ORDER BY p.name
    `;

    console.log(`✅ Your projects (${myProjects.length}):\n`);

    if (myProjects.length === 0) {
      console.log("   No projects found. You need to be added to projects.");
      console.log("\n💡 Run this to add yourself as owner to all projects:");
      console.log(`   pnpm tsx scripts/add-me-as-owner.ts ${userEmail}`);
    } else {
      myProjects.forEach((p: any) => {
        console.log(`   ${p.name}`);
        console.log(`   - Slug: ${p.slug}`);
        console.log(`   - Role: ${p.role}`);
        console.log(`   - Access settings: /projects/${p.slug}/settings`);
        console.log();
      });
    }

    // Check if there are projects you're NOT in
    const notInProjects = allProjects.filter(
      (p: any) => !myProjects.find((mp: any) => mp.id === p.id)
    );

    if (notInProjects.length > 0) {
      console.log(`\n⚠️  Projects you're NOT in (${notInProjects.length}):\n`);
      notInProjects.forEach((p: any) => {
        console.log(`   - ${p.name} (${p.slug})`);
      });
    }

    process.exit(0);
  } catch (error: any) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

checkMyProjects();
