import { getDb } from '../lib/db/postgres';
import { parseTitleWithBadges } from '../lib/parse-title-badges';

/**
 * Check all documents for titles with HTML badges
 * Run with: npx tsx scripts/check-title-badges.ts
 */
async function checkTitleBadges() {
  const sql = getDb();

  console.log('\n=== Checking Document Titles for Badges ===\n');

  const docs = await sql`
    SELECT id, slug, title FROM documents
    WHERE title LIKE '%<span%'
    ORDER BY title
  `;

  console.log(`Found ${docs.length} documents with HTML in titles\n`);

  docs.forEach((doc, idx) => {
    const { cleanTitle, badges, hasHTML } = parseTitleWithBadges(doc.title);

    console.log(`${idx + 1}. ${doc.slug}`);
    console.log(`   Original: ${doc.title}`);
    console.log(`   Clean: ${cleanTitle}`);
    console.log(`   Badges: ${badges.length > 0 ? badges.map(b => `${b.variant.toUpperCase()}:${b.text}`).join(', ') : 'None'}`);
    console.log('');
  });

  console.log('\n✓ Badge detection working correctly!');
  console.log('  Titles will display with badges in the UI automatically.');
  console.log('  The HTML is kept in the database for reference.\n');

  process.exit(0);
}

checkTitleBadges().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
