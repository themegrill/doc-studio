import { getDb } from "../../lib/db/postgres";

async function checkSettings() {
  const sql = getDb();

  try {
    console.log("🔍 Checking Global Settings...\n");

    // Get all settings
    const settings = await sql`
      SELECT key, category, description, value, created_at, updated_at
      FROM global_settings
      ORDER BY category, key
    `;

    if (settings.length === 0) {
      console.log("❌ No settings found in database");
      return;
    }

    console.log(`✅ Found ${settings.length} settings:\n`);

    let currentCategory = "";
    settings.forEach((setting) => {
      if (setting.category !== currentCategory) {
        currentCategory = setting.category;
        console.log(`\n📁 Category: ${currentCategory.toUpperCase()}`);
        console.log("─".repeat(60));
      }

      console.log(`\n🔑 Key: ${setting.key}`);
      console.log(`📝 Description: ${setting.description || "N/A"}`);
      console.log(`💾 Value:`);
      console.log(JSON.stringify(setting.value, null, 2));
      console.log(`⏰ Updated: ${new Date(setting.updated_at).toLocaleString()}`);
    });

    console.log("\n" + "─".repeat(60));
    console.log("✅ All settings loaded successfully!");
  } catch (error) {
    console.error("❌ Error checking settings:", error);
    throw error;
  } finally {
    await sql.end();
  }
}

checkSettings();
