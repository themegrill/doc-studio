import { getDb } from "../../lib/db/postgres";

/**
 * Diagnostic script to check navigation structure integrity
 * Run with: npx tsx scripts/diagnose-navigation.ts
 */
async function diagnoseNavigation() {
  const sql = getDb();

  console.log("\n=== Navigation Structure Diagnostic ===\n");

  // Get all projects
  const projects = await sql`SELECT id, name, slug FROM projects`;

  for (const project of projects) {
    console.log(`\n📁 Project: ${project.name} (${project.slug})`);
    console.log("─".repeat(60));

    // Get navigation
    const [nav] = await sql`
      SELECT structure FROM navigation WHERE project_id = ${project.id}
    `;

    if (!nav) {
      console.log("  ⚠️  No navigation found");
      continue;
    }

    const structure = nav.structure;
    console.log(`  Total sections: ${structure.routes?.length || 0}\n`);

    // Check each section
    structure.routes?.forEach((route: any, idx: number) => {
      console.log(`  ${idx + 1}. Section: "${route.title}"`);
      console.log(
        `     - Has path: ${!!route.path} ${
          route.path ? `(${route.path})` : ""
        }`
      );
      console.log(
        `     - Has id: ${!!route.id} ${route.id ? `(${route.id})` : ""}`
      );
      console.log(
        `     - Has slug: ${!!route.slug} ${
          route.slug ? `(${route.slug})` : ""
        }`
      );
      console.log(`     - Children: ${route.children?.length || 0}`);

      if (route.children && route.children.length > 0) {
        route.children.forEach((child: any, cIdx: number) => {
          console.log(`       ${cIdx + 1}. "${child.title}"`);
          console.log(`          - path: ${child.path || "❌ MISSING"}`);
          console.log(`          - slug: ${child.slug || "❌ MISSING"}`);
          console.log(`          - id: ${child.id || "❌ MISSING"}`);

          // Check if document exists
          const docSlug = child.slug || child.path?.replace("/docs/", "");
          if (docSlug) {
            sql`SELECT id, title FROM documents WHERE project_id = ${project.id} AND slug = ${docSlug}`.then(
              ([doc]) => {
                if (!doc) {
                  console.log(
                    `          ⚠️  Document not found in DB: ${docSlug}`
                  );
                } else if (doc.title !== child.title) {
                  console.log(
                    `          ⚠️  Title mismatch! Nav: "${child.title}", DB: "${doc.title}"`
                  );
                }
              }
            );
          }
        });
      }
      console.log("");
    });
  }

  console.log("\n✅ Diagnostic complete\n");
  process.exit(0);
}

diagnoseNavigation().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
