import { getDb } from "./db/postgres";

/**
 * Settings utility for managing global application settings
 * Supports namespaced key-value storage with JSONB values
 */

export interface SettingsManager {
  get<T = any>(key: string, defaultValue?: T): Promise<T | null>;
  set(key: string, value: any, category: string, description?: string): Promise<void>;
  getCategory(category: string): Promise<Record<string, any>>;
  delete(key: string): Promise<void>;
}

/**
 * Get a setting value by key
 */
export async function getSetting<T = any>(
  key: string,
  defaultValue?: T
): Promise<T | null> {
  const sql = getDb();

  try {
    const [setting] = await sql`
      SELECT value FROM global_settings WHERE key = ${key}
    `;

    if (!setting) {
      return defaultValue !== undefined ? defaultValue : null;
    }

    return setting.value as T;
  } catch (error) {
    console.error(`Error getting setting ${key}:`, error);
    return defaultValue !== undefined ? defaultValue : null;
  }
}

/**
 * Set a setting value
 */
export async function setSetting(
  key: string,
  value: any,
  category: string,
  description?: string
): Promise<void> {
  const sql = getDb();

  await sql`
    INSERT INTO global_settings (key, value, category, description, updated_at)
    VALUES (
      ${key},
      ${sql.json(value)},
      ${category},
      ${description || ""},
      NOW()
    )
    ON CONFLICT (key)
    DO UPDATE SET
      value = ${sql.json(value)},
      updated_at = NOW()
  `;
}

/**
 * Get all settings for a category
 */
export async function getCategorySettings(
  category: string
): Promise<Record<string, any>> {
  const sql = getDb();

  const settings = await sql`
    SELECT key, value FROM global_settings
    WHERE category = ${category}
  `;

  return settings.reduce((acc, setting) => {
    // Remove category prefix from key for easier access
    const shortKey = setting.key.replace(`${category}.`, "");
    acc[shortKey] = setting.value;
    return acc;
  }, {} as Record<string, any>);
}

/**
 * Delete a setting
 */
export async function deleteSetting(key: string): Promise<void> {
  const sql = getDb();

  await sql`
    DELETE FROM global_settings WHERE key = ${key}
  `;
}

/**
 * Get AI configuration settings
 */
export async function getAIConfig() {
  const config = await getSetting("ai.config", {
    apiKey: process.env.ANTHROPIC_API_KEY || "",
    defaultModel: "claude-sonnet-4-5",
    temperature: 0.7,
    maxTokens: 4096,
  });

  const features = await getSetting("ai.features", {
    chat: true,
    textGeneration: true,
    titleGeneration: true,
    descriptionGeneration: true,
  });

  return {
    ...config,
    enabledFeatures: features,
  };
}

/**
 * Check if an AI feature is enabled
 */
export async function isAIFeatureEnabled(
  feature: "chat" | "textGeneration" | "titleGeneration" | "descriptionGeneration"
): Promise<boolean> {
  const features = await getSetting("ai.features", {});
  return features[feature] ?? false;
}

// Export a settings object for easier usage
export const Settings = {
  get: getSetting,
  set: setSetting,
  getCategory: getCategorySettings,
  delete: deleteSetting,

  // Namespaced helpers
  ai: {
    getConfig: getAIConfig,
    isFeatureEnabled: isAIFeatureEnabled,
  },
};
