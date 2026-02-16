import { getDb } from '../lib/db/postgres';

/**
 * Check document content to diagnose rendering issues
 */
async function checkDocumentContent() {
  const sql = getDb();
  const slug = 'managing-users-in-user-registration-membership';

  console.log(`\n=== Checking document: ${slug} ===\n`);

  const [doc] = await sql`
    SELECT slug, title, blocks, published
    FROM documents
    WHERE slug = ${slug}
  `;

  if (!doc) {
    console.log('❌ Document not found');
    process.exit(1);
  }

  console.log(`Title: ${doc.title}`);
  console.log(`Published: ${doc.published}`);
  console.log(`Total blocks: ${doc.blocks.length}\n`);

  doc.blocks.forEach((block: any, idx: number) => {
    console.log(`Block ${idx + 1}:`);
    console.log(`  Type: ${block.type}`);
    console.log(`  ID: ${block.id}`);

    if (block.props) {
      console.log(`  Props:`, JSON.stringify(block.props, null, 4));
    }

    if (block.content) {
      console.log(`  Content (${block.content.length} items):`);
      block.content.forEach((item: any, i: number) => {
        if (item.type === 'text') {
          console.log(`    ${i + 1}. Text: "${item.text?.substring(0, 100)}${item.text?.length > 100 ? '...' : ''}"`);
          if (item.styles) {
            console.log(`       Styles:`, item.styles);
          }
          if (item.href) {
            console.log(`       Link: ${item.href}`);
          }
        } else {
          console.log(`    ${i + 1}.`, JSON.stringify(item, null, 4));
        }
      });
    } else {
      console.log(`  Content: NONE or EMPTY`);
    }

    if (block.children && block.children.length > 0) {
      console.log(`  Children: ${block.children.length} blocks`);
    }

    console.log('');
  });

  process.exit(0);
}

checkDocumentContent().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
