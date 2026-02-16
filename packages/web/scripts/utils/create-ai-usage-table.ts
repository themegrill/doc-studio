import { getDb } from "../../lib/db/postgres";

async function createAIUsageTable() {
  const sql = getDb();

  try {
    console.log("Creating ai_usage_logs table...");

    await sql`
      CREATE TABLE IF NOT EXISTS ai_usage_logs (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255),
        feature VARCHAR(50) NOT NULL,
        model VARCHAR(50) NOT NULL,
        prompt_tokens INTEGER NOT NULL,
        completion_tokens INTEGER NOT NULL,
        total_tokens INTEGER NOT NULL,
        estimated_cost DECIMAL(10, 6),
        duration_ms INTEGER,
        success BOOLEAN DEFAULT true,
        error_message TEXT,
        project_id VARCHAR(255),
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;

    console.log("✓ ai_usage_logs table created successfully");

    // Create indexes for common queries
    await sql`
      CREATE INDEX IF NOT EXISTS idx_ai_usage_created_at
      ON ai_usage_logs(created_at DESC)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_ai_usage_user_id
      ON ai_usage_logs(user_id)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_ai_usage_feature
      ON ai_usage_logs(feature)
    `;

    console.log("✓ Indexes created");

    // Insert some sample data for demonstration
    console.log("\n📊 Creating sample usage data...");

    const sampleData = [
      {
        feature: "chat",
        model: "claude-sonnet-4-5",
        promptTokens: 150,
        completionTokens: 320,
        cost: 0.0012,
      },
      {
        feature: "textGeneration",
        model: "claude-sonnet-4-5",
        promptTokens: 200,
        completionTokens: 450,
        cost: 0.0018,
      },
      {
        feature: "titleGeneration",
        model: "claude-haiku-4",
        promptTokens: 80,
        completionTokens: 20,
        cost: 0.0002,
      },
    ];

    for (const data of sampleData) {
      await sql`
        INSERT INTO ai_usage_logs (
          feature, model, prompt_tokens, completion_tokens,
          total_tokens, estimated_cost, duration_ms, success
        ) VALUES (
          ${data.feature},
          ${data.model},
          ${data.promptTokens},
          ${data.completionTokens},
          ${data.promptTokens + data.completionTokens},
          ${data.cost},
          ${Math.floor(Math.random() * 3000) + 500},
          true
        )
      `;
    }

    console.log("✓ Sample data inserted");

    // Show summary
    const [stats] = await sql`
      SELECT
        COUNT(*) as total_requests,
        SUM(total_tokens) as total_tokens,
        SUM(estimated_cost) as total_cost
      FROM ai_usage_logs
    `;

    console.log("\n📊 Current Usage Summary:");
    console.log(`  Total Requests: ${stats.total_requests}`);
    console.log(`  Total Tokens: ${stats.total_tokens?.toLocaleString()}`);
    console.log(`  Total Cost: $${Number(stats.total_cost).toFixed(4)}`);

    console.log("\n✅ Migration completed successfully!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  } finally {
    await sql.end();
  }
}

createAIUsageTable();
