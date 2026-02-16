import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/postgres";
import { NextResponse } from "next/server";
import {
  getUsageByFeature,
  getUsageByModel,
  getDailyUsage,
} from "@/lib/ai-usage-tracker";

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sql = getDb();

    // Check if user is admin
    const [user] = await sql`
      SELECT role FROM users WHERE id = ${session.user.id}
    `;

    if (!user || !["admin", "super_admin"].includes(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get("days") || "30");

    // Get overall stats
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const [overallStats] = await sql`
      SELECT
        COUNT(*) as total_requests,
        SUM(prompt_tokens) as total_prompt_tokens,
        SUM(completion_tokens) as total_completion_tokens,
        SUM(total_tokens) as total_tokens,
        SUM(estimated_cost) as total_cost,
        AVG(duration_ms) as avg_duration,
        SUM(CASE WHEN success = true THEN 1 ELSE 0 END) as successful_requests,
        SUM(CASE WHEN success = false THEN 1 ELSE 0 END) as failed_requests
      FROM ai_usage_logs
      WHERE created_at >= ${startDate}
    `;

    // Get today's stats
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [todayStats] = await sql`
      SELECT
        COUNT(*) as requests,
        SUM(total_tokens) as tokens,
        SUM(estimated_cost) as cost
      FROM ai_usage_logs
      WHERE created_at >= ${todayStart}
    `;

    // Get breakdown by feature and model
    const [byFeature, byModel, dailyUsage] = await Promise.all([
      getUsageByFeature(days),
      getUsageByModel(days),
      getDailyUsage(days),
    ]);

    return NextResponse.json({
      period: {
        days,
        startDate: startDate.toISOString(),
        endDate: new Date().toISOString(),
      },
      overall: {
        totalRequests: parseInt(overallStats.total_requests) || 0,
        totalTokens: parseInt(overallStats.total_tokens) || 0,
        promptTokens: parseInt(overallStats.total_prompt_tokens) || 0,
        completionTokens: parseInt(overallStats.total_completion_tokens) || 0,
        totalCost: parseFloat(overallStats.total_cost) || 0,
        avgDuration: parseFloat(overallStats.avg_duration) || 0,
        successfulRequests: parseInt(overallStats.successful_requests) || 0,
        failedRequests: parseInt(overallStats.failed_requests) || 0,
        successRate:
          overallStats.total_requests > 0
            ? (parseInt(overallStats.successful_requests) /
                parseInt(overallStats.total_requests)) *
              100
            : 0,
      },
      today: {
        requests: parseInt(todayStats.requests) || 0,
        tokens: parseInt(todayStats.tokens) || 0,
        cost: parseFloat(todayStats.cost) || 0,
      },
      byFeature: byFeature.map((f) => ({
        feature: f.feature,
        requests: parseInt(f.requests),
        tokens: parseInt(f.tokens),
        cost: parseFloat(f.cost),
      })),
      byModel: byModel.map((m) => ({
        model: m.model,
        requests: parseInt(m.requests),
        tokens: parseInt(m.tokens),
        cost: parseFloat(m.cost),
      })),
      daily: dailyUsage.map((d) => ({
        date: d.date,
        requests: parseInt(d.requests),
        tokens: parseInt(d.tokens),
        cost: parseFloat(d.cost),
      })),
    });
  } catch (error) {
    console.error("Error fetching AI usage stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch usage statistics" },
      { status: 500 }
    );
  }
}
