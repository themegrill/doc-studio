import { getDb } from "./db/postgres";

/**
 * Settings utility for managing global application settings
 * Supports namespaced key-value storage with JSONB values
 */

type JSONValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JSONValue }
  | JSONValue[];

type AIFeatures = {
  chat: boolean;
  textGeneration: boolean;
  titleGeneration: boolean;
  descriptionGeneration: boolean;
};

type AIConfig = {
  apiKey: string;
  defaultModel: string;
  temperature: number;
  maxTokens: number;
};

export interface SettingsManager {
  get<T>(key: string): Promise<T | null>;
  get<T>(key: string, defaultValue: T): Promise<T>;
  set(
    key: string,
    value: JSONValue,
    category: string,
    description?: string
  ): Promise<void>;
  getCategory(category: string): Promise<Record<string, unknown>>;
  delete(key: string): Promise<void>;
}

/**
 * Get a setting value by key
 */
export async function getSetting<T>(key: string): Promise<T | null>;
export async function getSetting<T>(key: string, defaultValue: T): Promise<T>;
export async function getSetting<T>(
  key: string,
  defaultValue?: T
): Promise<T | null> {
  const sql = getDb();

  try {
    const [setting] = await sql`
      SELECT value
      FROM global_settings
      WHERE key = ${key}
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
  value: JSONValue,
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
      ${description ?? ""},
      NOW()
    )
    ON CONFLICT (key)
    DO UPDATE SET
      value = EXCLUDED.value,
      category = EXCLUDED.category,
      description = EXCLUDED.description,
      updated_at = NOW()
  `;
}

/**
 * Get all settings for a category
 */
export async function getCategorySettings(
  category: string
): Promise<Record<string, unknown>> {
  const sql = getDb();

  const settings = await sql`
    SELECT key, value
    FROM global_settings
    WHERE category = ${category}
  `;

  return settings.reduce<Record<string, unknown>>((acc, setting) => {
    const shortKey = String(setting.key).replace(`${category}.`, "");
    acc[shortKey] = setting.value;
    return acc;
  }, {});
}

/**
 * Delete a setting
 */
export async function deleteSetting(key: string): Promise<void> {
  const sql = getDb();

  await sql`
    DELETE FROM global_settings
    WHERE key = ${key}
  `;
}

/**
 * Get AI configuration settings
 */
export async function getAIConfig(): Promise<
  AIConfig & { enabledFeatures: AIFeatures }
> {
  const config = await getSetting<AIConfig>("ai.config", {
    apiKey: process.env.ANTHROPIC_API_KEY || "",
    defaultModel: "claude-sonnet-4-5",
    temperature: 0.7,
    maxTokens: 4096,
  });

  const features = await getSetting<AIFeatures>("ai.features", {
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
  feature: keyof AIFeatures
): Promise<boolean> {
  const features = await getSetting<AIFeatures>("ai.features", {
    chat: true,
    textGeneration: true,
    titleGeneration: true,
    descriptionGeneration: true,
  });

  return features[feature] ?? false;
}

// Export a settings object for easier usage
export const Settings: SettingsManager & {
  ai: {
    getConfig: typeof getAIConfig;
    isFeatureEnabled: typeof isAIFeatureEnabled;
  };
} = {
  get: getSetting,
  set: setSetting,
  getCategory: getCategorySettings,
  delete: deleteSetting,
  ai: {
    getConfig: getAIConfig,
    isFeatureEnabled: isAIFeatureEnabled,
  },
};
