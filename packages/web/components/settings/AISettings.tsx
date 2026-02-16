"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Bot,
  Key,
  Settings,
  Sparkles,
  CheckCircle2,
  XCircle,
  Loader2,
  BarChart3,
  Save,
} from "lucide-react";
import { UsageStatistics } from "./UsageStatistics";

interface AISettingsData {
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

export function AISettings() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [apiKeyStatus, setApiKeyStatus] = useState<"valid" | "invalid" | "unknown">("unknown");
  const [showApiKey, setShowApiKey] = useState(false);

  const [settings, setSettings] = useState<AISettingsData>({
    apiKey: "",
    defaultModel: "claude-sonnet-4-5",
    temperature: 0.7,
    maxTokens: 4096,
    enabledFeatures: {
      chat: true,
      textGeneration: true,
      titleGeneration: true,
      descriptionGeneration: true,
    },
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await fetch("/api/settings/ai");
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
        setApiKeyStatus(data.apiKey ? "valid" : "unknown");
      }
    } catch (error) {
      console.error("Failed to load AI settings:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch("/api/settings/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        throw new Error("Failed to save settings");
      }

      toast({
        title: "Settings Saved",
        description: "AI settings have been updated successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save AI settings",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    try {
      const response = await fetch("/api/settings/ai/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: settings.apiKey }),
      });

      const data = await response.json();

      if (data.success) {
        setApiKeyStatus("valid");
        toast({
          title: "Connection Successful",
          description: "Your API key is valid and working",
        });
      } else {
        setApiKeyStatus("invalid");
        toast({
          title: "Connection Failed",
          description: data.error || "Invalid API key",
          variant: "destructive",
        });
      }
    } catch (error) {
      setApiKeyStatus("invalid");
      toast({
        title: "Connection Failed",
        description: "Failed to test API connection",
        variant: "destructive",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleFeatureToggle = (feature: keyof AISettingsData["enabledFeatures"]) => {
    setSettings({
      ...settings,
      enabledFeatures: {
        ...settings.enabledFeatures,
        [feature]: !settings.enabledFeatures[feature],
      },
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* API Configuration */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5 text-blue-600" />
            <CardTitle>API Configuration</CardTitle>
          </div>
          <CardDescription>
            Configure your Anthropic Claude API credentials
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="apiKey">Anthropic API Key</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="apiKey"
                  type={showApiKey ? "text" : "password"}
                  value={settings.apiKey}
                  onChange={(e) =>
                    setSettings({ ...settings, apiKey: e.target.value })
                  }
                  placeholder="sk-ant-api03-..."
                  className="pr-10"
                />
                {apiKeyStatus === "valid" && (
                  <CheckCircle2 className="absolute right-3 top-3 h-4 w-4 text-green-600" />
                )}
                {apiKeyStatus === "invalid" && (
                  <XCircle className="absolute right-3 top-3 h-4 w-4 text-red-600" />
                )}
              </div>
              <Button
                variant="outline"
                onClick={() => setShowApiKey(!showApiKey)}
              >
                {showApiKey ? "Hide" : "Show"}
              </Button>
            </div>
            <p className="text-xs text-gray-500">
              Get your API key from{" "}
              <a
                href="https://console.anthropic.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                Anthropic Console
              </a>
            </p>
          </div>

          <Button
            variant="outline"
            onClick={handleTestConnection}
            disabled={!settings.apiKey || isTesting}
          >
            {isTesting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Testing Connection...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Test Connection
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Model Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-purple-600" />
            <CardTitle>Model Settings</CardTitle>
          </div>
          <CardDescription>
            Configure default AI model and parameters
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="model">Default Model</Label>
            <Select
              value={settings.defaultModel}
              onValueChange={(value) =>
                setSettings({ ...settings, defaultModel: value })
              }
            >
              <SelectTrigger id="model">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="claude-opus-4">
                  Claude Opus 4 (Most Capable)
                </SelectItem>
                <SelectItem value="claude-sonnet-4-5">
                  Claude Sonnet 4.5 (Balanced - Recommended)
                </SelectItem>
                <SelectItem value="claude-sonnet-4">
                  Claude Sonnet 4 (Balanced)
                </SelectItem>
                <SelectItem value="claude-haiku-4">
                  Claude Haiku 4 (Fast & Cost-Effective)
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500">
              Different models balance speed, capability, and cost
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="temperature">
                Temperature: {settings.temperature}
              </Label>
              <Input
                id="temperature"
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={settings.temperature}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    temperature: parseFloat(e.target.value),
                  })
                }
              />
              <p className="text-xs text-gray-500">
                Lower = more focused, Higher = more creative
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxTokens">Max Tokens</Label>
              <Input
                id="maxTokens"
                type="number"
                min="256"
                max="8192"
                step="256"
                value={settings.maxTokens}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    maxTokens: parseInt(e.target.value),
                  })
                }
              />
              <p className="text-xs text-gray-500">
                Maximum length of AI responses
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Feature Controls */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-600" />
            <CardTitle>AI Features</CardTitle>
          </div>
          <CardDescription>
            Enable or disable specific AI-powered features
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="chat">AI Chat Assistant</Label>
                <p className="text-sm text-gray-500">
                  Inline chat for writing assistance
                </p>
              </div>
              <Switch
                id="chat"
                checked={settings.enabledFeatures.chat}
                onCheckedChange={() => handleFeatureToggle("chat")}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="textGeneration">Text Generation</Label>
                <p className="text-sm text-gray-500">
                  Generate and improve text content
                </p>
              </div>
              <Switch
                id="textGeneration"
                checked={settings.enabledFeatures.textGeneration}
                onCheckedChange={() => handleFeatureToggle("textGeneration")}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="titleGeneration">Title Generation</Label>
                <p className="text-sm text-gray-500">
                  Auto-generate document titles
                </p>
              </div>
              <Switch
                id="titleGeneration"
                checked={settings.enabledFeatures.titleGeneration}
                onCheckedChange={() => handleFeatureToggle("titleGeneration")}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="descriptionGeneration">
                  Description Generation
                </Label>
                <p className="text-sm text-gray-500">
                  Auto-generate document descriptions
                </p>
              </div>
              <Switch
                id="descriptionGeneration"
                checked={settings.enabledFeatures.descriptionGeneration}
                onCheckedChange={() =>
                  handleFeatureToggle("descriptionGeneration")
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Usage Statistics */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-green-600" />
            <CardTitle>Usage Statistics</CardTitle>
          </div>
          <CardDescription>
            Monitor your AI usage, costs, and trends
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UsageStatistics />
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving} size="lg">
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save Settings
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
