import { getDb } from "../../lib/db/postgres";

async function checkUsageLogs() {
  const sql = getDb();

  try {
    console.log("🔍 Checking AI Usage Logs...\n");

    // Check if table exists
    const [tableExists] = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'ai_usage_logs'
      ) as exists
    `;

    if (!tableExists.exists) {
      console.log("❌ ai_usage_logs table does not exist");
      console.log("Run: npx tsx scripts/utils/create-ai-usage-table.ts");
      return;
    }

    console.log("✅ ai_usage_logs table exists\n");

    // Get total count
    const [count] = await sql`
      SELECT COUNT(*) as total FROM ai_usage_logs
    `;

    console.log(`📊 Total usage logs: ${count.total}\n`);

    if (count.total > 0) {
      // Get summary stats
      const [stats] = await sql`
        SELECT
          COUNT(*) as total_requests,
          SUM(total_tokens) as total_tokens,
          SUM(estimated_cost) as total_cost,
          SUM(CASE WHEN success = true THEN 1 ELSE 0 END) as successful,
          SUM(CASE WHEN success = false THEN 1 ELSE 0 END) as failed
        FROM ai_usage_logs
      `;

      console.log("📈 Summary Statistics:");
      console.log(`  Total Requests: ${stats.total_requests}`);
      console.log(`  Total Tokens: ${stats.total_tokens?.toLocaleString()}`);
      console.log(`  Total Cost: $${Number(stats.total_cost).toFixed(4)}`);
      console.log(`  Successful: ${stats.successful}`);
      console.log(`  Failed: ${stats.failed}`);

      // Get recent logs
      console.log("\n📝 Recent Logs (last 5):");
      const recentLogs = await sql`
        SELECT
          id, feature, model, total_tokens,
          estimated_cost, success, created_at
        FROM ai_usage_logs
        ORDER BY created_at DESC
        LIMIT 5
      `;

      recentLogs.forEach((log) => {
        console.log(`\n  ID: ${log.id}`);
        console.log(`  Feature: ${log.feature}`);
        console.log(`  Model: ${log.model}`);
        console.log(`  Tokens: ${log.total_tokens}`);
        console.log(`  Cost: $${Number(log.estimated_cost).toFixed(4)}`);
        console.log(`  Success: ${log.success ? "✅" : "❌"}`);
        console.log(`  Time: ${new Date(log.created_at).toLocaleString()}`);
      });

      // Get by feature
      console.log("\n📊 Usage by Feature:");
      const byFeature = await sql`
        SELECT
          feature,
          COUNT(*) as requests,
          SUM(total_tokens) as tokens,
          SUM(estimated_cost) as cost
        FROM ai_usage_logs
        GROUP BY feature
        ORDER BY requests DESC
      `;

      byFeature.forEach((f) => {
        console.log(`  ${f.feature}: ${f.requests} requests, ${f.tokens} tokens, $${Number(f.cost).toFixed(4)}`);
      });
    } else {
      console.log("ℹ️  No usage logs yet");
      console.log("\nTo test usage statistics:");
      console.log("1. Use AI features in your app");
      console.log("2. Or integrate tracking in AI API routes");
      console.log("3. See USAGE_TRACKING_INTEGRATION.md for details");
    }

    console.log("\n✅ Check complete!");
  } catch (error) {
    console.error("❌ Error checking usage logs:", error);
    throw error;
  } finally {
    await sql.end();
  }
}

checkUsageLogs();
