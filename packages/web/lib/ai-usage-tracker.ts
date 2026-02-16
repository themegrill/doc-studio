import { getDb } from "./db/postgres";

/**
 * AI Usage Tracker
 * Tracks API usage, token consumption, and estimated costs
 */

// Pricing per 1M tokens (as of Feb 2026)
const MODEL_PRICING = {
  "claude-opus-4": { input: 15.0, output: 75.0 },
  "claude-opus-4-6": { input: 15.0, output: 75.0 },
  "claude-sonnet-4-5": { input: 3.0, output: 15.0 },
  "claude-sonnet-4": { input: 3.0, output: 15.0 },
  "claude-haiku-4": { input: 0.25, output: 1.25 },
  "claude-haiku-4-5": { input: 0.25, output: 1.25 },
} as const;

export interface UsageLogEntry {
  userId?: string;
  feature: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  durationMs?: number;
  success?: boolean;
  errorMessage?: string;
  projectId?: string;
  metadata?: Record<string, any>;
}

/**
 * Calculate estimated cost based on token usage
 */
export function calculateCost(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const pricing =
    MODEL_PRICING[model as keyof typeof MODEL_PRICING] ||
    MODEL_PRICING["claude-sonnet-4-5"];

  const inputCost = (promptTokens / 1_000_000) * pricing.input;
  const outputCost = (completionTokens / 1_000_000) * pricing.output;

  return inputCost + outputCost;
}

/**
 * Log AI API usage to database
 */
export async function logAIUsage(entry: UsageLogEntry): Promise<void> {
  const sql = getDb();

  try {
    const totalTokens = entry.promptTokens + entry.completionTokens;
    const estimatedCost = calculateCost(
      entry.model,
      entry.promptTokens,
      entry.completionTokens
    );

    await sql`
      INSERT INTO ai_usage_logs (
        user_id,
        feature,
        model,
        prompt_tokens,
        completion_tokens,
        total_tokens,
        estimated_cost,
        duration_ms,
        success,
        error_message,
        project_id,
        metadata
      ) VALUES (
        ${entry.userId || null},
        ${entry.feature},
        ${entry.model},
        ${entry.promptTokens},
        ${entry.completionTokens},
        ${totalTokens},
        ${estimatedCost},
        ${entry.durationMs || null},
        ${entry.success ?? true},
        ${entry.errorMessage || null},
        ${entry.projectId || null},
        ${entry.metadata ? JSON.stringify(entry.metadata) : null}
      )
    `;
  } catch (error) {
    console.error("Failed to log AI usage:", error);
    // Don't throw - we don't want to break the main functionality
  }
}

/**
 * Get usage statistics for a time period
 */
export async function getUsageStats(options: {
  startDate?: Date;
  endDate?: Date;
  userId?: string;
  feature?: string;
}) {
  const sql = getDb();

  const conditions = [];
  const params: any = {};

  if (options.startDate) {
    conditions.push(`created_at >= ${sql([options.startDate])}`);
  }
  if (options.endDate) {
    conditions.push(`created_at <= ${sql([options.endDate])}`);
  }
  if (options.userId) {
    conditions.push(`user_id = ${sql([options.userId])}`);
  }
  if (options.feature) {
    conditions.push(`feature = ${sql([options.feature])}`);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const [stats] = await sql`
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
    ${conditions.length > 0 ? sql`WHERE ${sql.unsafe(whereClause.replace("WHERE ", ""))}` : sql``}
  `;

  return stats;
}

/**
 * Get usage by feature breakdown
 */
export async function getUsageByFeature(days: number = 30) {
  const sql = getDb();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const stats = await sql`
    SELECT
      feature,
      COUNT(*) as requests,
      SUM(total_tokens) as tokens,
      SUM(estimated_cost) as cost
    FROM ai_usage_logs
    WHERE created_at >= ${startDate}
    GROUP BY feature
    ORDER BY cost DESC
  `;

  return stats;
}

/**
 * Get usage by model breakdown
 */
export async function getUsageByModel(days: number = 30) {
  const sql = getDb();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const stats = await sql`
    SELECT
      model,
      COUNT(*) as requests,
      SUM(total_tokens) as tokens,
      SUM(estimated_cost) as cost
    FROM ai_usage_logs
    WHERE created_at >= ${startDate}
    GROUP BY model
    ORDER BY requests DESC
  `;

  return stats;
}

/**
 * Get daily usage for the last N days
 */
export async function getDailyUsage(days: number = 30) {
  const sql = getDb();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const stats = await sql`
    SELECT
      DATE(created_at) as date,
      COUNT(*) as requests,
      SUM(total_tokens) as tokens,
      SUM(estimated_cost) as cost
    FROM ai_usage_logs
    WHERE created_at >= ${startDate}
    GROUP BY DATE(created_at)
    ORDER BY date DESC
  `;

  return stats;
}

/**
 * Wrapper to track AI API calls automatically
 */
export async function trackAICall<T>(
  feature: string,
  model: string,
  apiCall: () => Promise<T>,
  metadata?: {
    userId?: string;
    projectId?: string;
    [key: string]: any;
  }
): Promise<T> {
  const startTime = Date.now();

  try {
    const result = await apiCall();
    const duration = Date.now() - startTime;

    // Extract token counts from response if available
    const response = result as any;
    const promptTokens = response.usage?.input_tokens || 0;
    const completionTokens = response.usage?.output_tokens || 0;

    if (promptTokens > 0 || completionTokens > 0) {
      await logAIUsage({
        userId: metadata?.userId,
        feature,
        model,
        promptTokens,
        completionTokens,
        durationMs: duration,
        success: true,
        projectId: metadata?.projectId,
        metadata,
      });
    }

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;

    await logAIUsage({
      userId: metadata?.userId,
      feature,
      model,
      promptTokens: 0,
      completionTokens: 0,
      durationMs: duration,
      success: false,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
      projectId: metadata?.projectId,
      metadata,
    });

    throw error;
  }
}
