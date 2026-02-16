/**
 * AI Configuration Helper
 * Provides easy access to AI settings for API routes
 */

import { Settings } from "./settings";

export interface AIConfig {
  apiKey: string;
  defaultModel: string;
  temperature: number;
  maxTokens: number;
  enabledFeatures: {
    chat: boolean;
    textGeneration: boolean;
    titleGeneration: boolean;
    descriptionGeneration: boolean;
  };
}

/**
 * Get current AI configuration from database settings
 * Falls back to environment variables if not set
 */
export async function getAIConfig(): Promise<AIConfig> {
  const config = await Settings.ai.getConfig();

  // If API key is not set in database, use environment variable
  if (!config.apiKey && process.env.ANTHROPIC_API_KEY) {
    config.apiKey = process.env.ANTHROPIC_API_KEY;
  }

  return config as AIConfig;
}

/**
 * Check if a specific AI feature is enabled
 */
export async function isFeatureEnabled(
  feature: "chat" | "textGeneration" | "titleGeneration" | "descriptionGeneration"
): Promise<boolean> {
  return await Settings.ai.isFeatureEnabled(feature);
}

/**
 * Get the model to use (from settings or fallback to default)
 */
export async function getModelToUse(): Promise<string> {
  const config = await getAIConfig();
  return config.defaultModel || "claude-sonnet-4-5";
}

/**
 * Get temperature setting
 */
export async function getTemperature(): Promise<number> {
  const config = await getAIConfig();
  return config.temperature || 0.7;
}

/**
 * Get max tokens setting
 */
export async function getMaxTokens(): Promise<number> {
  const config = await getAIConfig();
  return config.maxTokens || 4096;
}

/**
 * Validate that AI is configured and feature is enabled
 * Returns error response if not configured/enabled, null if OK
 */
export async function validateAIFeature(
  feature: "chat" | "textGeneration" | "titleGeneration" | "descriptionGeneration"
): Promise<{ error: string; status: number } | null> {
  // Check if feature is enabled
  const enabled = await isFeatureEnabled(feature);
  if (!enabled) {
    return {
      error: `${feature} feature is currently disabled in settings`,
      status: 403,
    };
  }

  // Check if API key is configured
  const config = await getAIConfig();
  if (!config.apiKey) {
    return {
      error: "Anthropic API key not configured. Please configure it in settings.",
      status: 500,
    };
  }

  return null;
}
