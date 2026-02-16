"use client";

import { useEffect, useState } from "react";

interface AIFeatures {
  chat: boolean;
  textGeneration: boolean;
  titleGeneration: boolean;
  descriptionGeneration: boolean;
}

interface AIFeaturesHook {
  features: AIFeatures;
  isLoading: boolean;
  isEnabled: (feature: keyof AIFeatures) => boolean;
  refresh: () => Promise<void>;
}

/**
 * Hook to check if AI features are enabled
 * Use this in components to conditionally show/hide AI features
 */
export function useAIFeatures(): AIFeaturesHook {
  const [features, setFeatures] = useState<AIFeatures>({
    chat: true,
    textGeneration: true,
    titleGeneration: true,
    descriptionGeneration: true,
  });
  const [isLoading, setIsLoading] = useState(true);

  const loadFeatures = async () => {
    try {
      const response = await fetch("/api/settings/ai/features");
      if (response.ok) {
        const data = await response.json();
        setFeatures(data.features);
      }
    } catch (error) {
      console.error("Failed to load AI features:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadFeatures();
  }, []);

  const isEnabled = (feature: keyof AIFeatures): boolean => {
    return features[feature] ?? false;
  };

  return {
    features,
    isLoading,
    isEnabled,
    refresh: loadFeatures,
  };
}
