import { getDb } from "../../lib/db/postgres";

async function createGlobalSettingsTable() {
  const sql = getDb();

  try {
    console.log("Creating global_settings table...");

    await sql`
      CREATE TABLE IF NOT EXISTS global_settings (
        key VARCHAR(100) PRIMARY KEY,
        value JSONB NOT NULL,
        category VARCHAR(50) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;

    console.log("✓ global_settings table created successfully");

    // Create index for faster category lookups
    await sql`
      CREATE INDEX IF NOT EXISTS idx_global_settings_category
      ON global_settings(category)
    `;

    console.log("✓ Category index created");

    // Insert default AI settings
    await sql`
      INSERT INTO global_settings (key, value, category, description)
      VALUES
        (
          'ai.config',
          ${JSON.stringify({
            apiKey: "",
            defaultModel: "claude-sonnet-4-5",
            temperature: 0.7,
            maxTokens: 4096,
          })}::jsonb,
          'ai',
          'AI model configuration and API credentials'
        ),
        (
          'ai.features',
          ${JSON.stringify({
            chat: true,
            textGeneration: true,
            titleGeneration: true,
            descriptionGeneration: true,
          })}::jsonb,
          'ai',
          'Enabled AI features across the platform'
        )
      ON CONFLICT (key) DO NOTHING
    `;

    console.log("✓ Default AI settings inserted");

    // Show current settings
    const settings = await sql`
      SELECT key, category, description, value
      FROM global_settings
      ORDER BY category, key
    `;

    console.log("\n📊 Current Global Settings:");
    settings.forEach((setting) => {
      console.log(`  ${setting.category}.${setting.key}`);
      console.log(`    ${setting.description}`);
    });

    console.log("\n✅ Migration completed successfully!");
    console.log("\n💡 Future settings can be added like:");
    console.log("  - branding.logo, branding.colors");
    console.log("  - email.smtp, email.templates");
    console.log("  - security.session, security.mfa");
    console.log("  - notifications.slack, notifications.email");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  } finally {
    await sql.end();
  }
}

createGlobalSettingsTable();
