#!/usr/bin/env tsx

import { getDb } from "../lib/db/postgres";

async function checkUserRoles() {
  const sql = getDb();

  try {
    console.log("👥 Checking all user roles...\n");

    const users = await sql`
      SELECT id, email, name, role
      FROM users
      ORDER BY created_at DESC
    `;

    console.log("System Roles (from users table):");
    console.log("─".repeat(60));
    users.forEach((user) => {
      console.log(`${user.email.padEnd(30)} → ${user.role}`);
    });

    console.log("\n📊 Project Roles (from project_members table):");
    console.log("─".repeat(60));

    const projectRoles = await sql`
      SELECT
        u.email,
        p.name as project_name,
        pm.role as project_role
      FROM users u
      JOIN project_members pm ON u.id = pm.user_id
      JOIN projects p ON pm.project_id = p.id
      ORDER BY u.email, p.name
    `;

    projectRoles.forEach((pr) => {
      console.log(`${pr.email.padEnd(30)} → ${pr.project_name}: ${pr.project_role}`);
    });

    console.log("\n✅ Role check complete!");
    process.exit(0);
  } catch (error: any) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

checkUserRoles();
