import { getDb } from '../lib/db/postgres';

/**
 * Check which sections have overview documents
 */
async function checkSectionOverviews() {
  const sql = getDb();

  console.log('\n=== Checking Section Overview Documents ===\n');

  const projects = await sql`SELECT id, name, slug FROM projects`;

  for (const project of projects) {
    console.log(`\n📁 Project: ${project.name} (${project.slug})`);

    const [nav] = await sql`
      SELECT structure FROM navigation WHERE project_id = ${project.id}
    `;

    if (!nav) continue;

    const structure = nav.structure;

    for (const route of structure.routes || []) {
      console.log(`\n  Section: "${route.title}"`);
      console.log(`    Has path: ${!!route.path}`);
      console.log(`    Children: ${route.children?.length || 0}`);

      if (route.children && route.children.length > 0) {
        // Check if first child is a section overview
        const firstChild = route.children[0];
        const firstChildSlug = firstChild.slug || firstChild.path?.replace('/docs/', '');

        // Check if there's a document that matches the section name
        // (section overview would have a slug without slash)
        const sectionSlug = firstChildSlug?.split('/')[0];

        const [overviewDoc] = await sql`
          SELECT id, slug, title FROM documents
          WHERE project_id = ${project.id}
          AND slug = ${sectionSlug}
        `;

        if (overviewDoc) {
          console.log(`    ✓ HAS OVERVIEW: ${overviewDoc.slug} - "${overviewDoc.title}"`);
        } else {
          console.log(`    ✗ NO OVERVIEW (first child: ${firstChildSlug})`);
        }
      }
    }
  }

  console.log('\n');
  process.exit(0);
}

checkSectionOverviews().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
