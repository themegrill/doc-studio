/**
 * Test AI Configuration System
 * Verifies that settings are loaded and used correctly
 */

import { getAIConfig, isFeatureEnabled, validateAIFeature } from "../../lib/ai-config";

async function testAIConfig() {
  console.log("🧪 Testing AI Configuration System...\n");

  try {
    // Test 1: Load AI Config
    console.log("1️⃣ Testing getAIConfig()...");
    const config = await getAIConfig();
    console.log("✅ Config loaded:");
    console.log(`   API Key: ${config.apiKey ? "***" + config.apiKey.slice(-8) : "Not set"}`);
    console.log(`   Model: ${config.defaultModel}`);
    console.log(`   Temperature: ${config.temperature}`);
    console.log(`   Max Tokens: ${config.maxTokens}`);
    console.log(`   Features:`, config.enabledFeatures);

    // Test 2: Check individual features
    console.log("\n2️⃣ Testing isFeatureEnabled()...");
    const features = ["chat", "textGeneration", "titleGeneration", "descriptionGeneration"] as const;
    for (const feature of features) {
      const enabled = await isFeatureEnabled(feature);
      console.log(`   ${feature}: ${enabled ? "✅ Enabled" : "❌ Disabled"}`);
    }

    // Test 3: Validate features
    console.log("\n3️⃣ Testing validateAIFeature()...");
    for (const feature of features) {
      const validation = await validateAIFeature(feature);
      if (validation) {
        console.log(`   ${feature}: ❌ ${validation.error}`);
      } else {
        console.log(`   ${feature}: ✅ Ready to use`);
      }
    }

    // Test 4: Check API key
    console.log("\n4️⃣ Testing API Key Configuration...");
    if (config.apiKey) {
      console.log("   ✅ API key is configured");
      if (config.apiKey === process.env.ANTHROPIC_API_KEY) {
        console.log("   📝 Using environment variable");
      } else {
        console.log("   📝 Using database setting");
      }
    } else {
      console.log("   ⚠️  API key not configured");
      console.log("   Set it in /settings or .env.local");
    }

    // Test 5: Model validation
    console.log("\n5️⃣ Testing Model Configuration...");
    const validModels = [
      "claude-opus-4",
      "claude-opus-4-6",
      "claude-sonnet-4-5",
      "claude-sonnet-4",
      "claude-haiku-4",
      "claude-haiku-4-5",
    ];
    if (validModels.includes(config.defaultModel)) {
      console.log(`   ✅ Model '${config.defaultModel}' is valid`);
    } else {
      console.log(`   ⚠️  Model '${config.defaultModel}' may not be recognized`);
    }

    // Test 6: Parameter validation
    console.log("\n6️⃣ Testing Parameter Ranges...");

    if (config.temperature >= 0 && config.temperature <= 1) {
      console.log(`   ✅ Temperature ${config.temperature} is in valid range (0-1)`);
    } else {
      console.log(`   ⚠️  Temperature ${config.temperature} is outside valid range`);
    }

    if (config.maxTokens >= 256 && config.maxTokens <= 8192) {
      console.log(`   ✅ Max tokens ${config.maxTokens} is in valid range (256-8192)`);
    } else {
      console.log(`   ⚠️  Max tokens ${config.maxTokens} is outside typical range`);
    }

    console.log("\n✅ All configuration tests completed!");
    console.log("\n📊 Summary:");
    console.log(`   Model: ${config.defaultModel}`);
    console.log(`   Temperature: ${config.temperature}`);
    console.log(`   Max Tokens: ${config.maxTokens}`);
    const enabledCount = Object.values(config.enabledFeatures).filter(Boolean).length;
    console.log(`   Enabled Features: ${enabledCount}/${features.length}`);

    console.log("\n🌐 To test in your app:");
    console.log("   1. Go to http://localhost:3000/settings");
    console.log("   2. Change model to Claude Haiku 4");
    console.log("   3. Change temperature to 0.3");
    console.log("   4. Toggle a feature OFF");
    console.log("   5. Save and use AI features");
    console.log("   6. Check server logs to see settings being used");

  } catch (error) {
    console.error("❌ Configuration test failed:", error);
    throw error;
  }
}

testAIConfig();
