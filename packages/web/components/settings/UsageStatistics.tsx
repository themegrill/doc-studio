"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart3,
  TrendingUp,
  Zap,
  DollarSign,
  Activity,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface UsageStats {
  period: {
    days: number;
    startDate: string;
    endDate: string;
  };
  overall: {
    totalRequests: number;
    totalTokens: number;
    promptTokens: number;
    completionTokens: number;
    totalCost: number;
    avgDuration: number;
    successfulRequests: number;
    failedRequests: number;
    successRate: number;
  };
  today: {
    requests: number;
    tokens: number;
    cost: number;
  };
  byFeature: Array<{
    feature: string;
    requests: number;
    tokens: number;
    cost: number;
  }>;
  byModel: Array<{
    model: string;
    requests: number;
    tokens: number;
    cost: number;
  }>;
  daily: Array<{
    date: string;
    requests: number;
    tokens: number;
    cost: number;
  }>;
}

export function UsageStatistics() {
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [period, setPeriod] = useState("30");

  useEffect(() => {
    loadStats();
  }, [period]);

  const loadStats = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/settings/ai/usage?days=${period}`);
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error("Failed to load usage stats:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatCost = (cost: number) => {
    return `$${cost.toFixed(4)}`;
  };

  const formatNumber = (num: number) => {
    return num.toLocaleString();
  };

  const getFeatureName = (feature: string) => {
    const names: Record<string, string> = {
      chat: "Chat Assistant",
      textGeneration: "Text Generation",
      titleGeneration: "Title Generation",
      descriptionGeneration: "Description Generation",
      improve: "Text Improvement",
    };
    return names[feature] || feature;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!stats) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-gray-500">
            No usage data available yet. Start using AI features to see statistics.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Usage Period</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={loadStats}
            disabled={isLoading}
            className="p-2 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-50"
            title="Refresh statistics"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Requests</p>
                <p className="text-2xl font-bold mt-1">
                  {formatNumber(stats.overall.totalRequests)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Today: {formatNumber(stats.today.requests)}
                </p>
              </div>
              <Activity className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Tokens</p>
                <p className="text-2xl font-bold mt-1">
                  {formatNumber(stats.overall.totalTokens)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Today: {formatNumber(stats.today.tokens)}
                </p>
              </div>
              <Zap className="h-8 w-8 text-amber-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Cost</p>
                <p className="text-2xl font-bold mt-1">
                  {formatCost(stats.overall.totalCost)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Today: {formatCost(stats.today.cost)}
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Success Rate</p>
                <p className="text-2xl font-bold mt-1">
                  {stats.overall.successRate.toFixed(1)}%
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {formatNumber(stats.overall.successfulRequests)} /{" "}
                  {formatNumber(stats.overall.totalRequests)}
                </p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Usage by Feature */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Usage by Feature
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats.byFeature.length > 0 ? (
            <div className="space-y-4">
              {stats.byFeature.map((feature) => {
                const percentage =
                  stats.overall.totalRequests > 0
                    ? (feature.requests / stats.overall.totalRequests) * 100
                    : 0;

                return (
                  <div key={feature.feature}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">
                        {getFeatureName(feature.feature)}
                      </span>
                      <span className="text-sm text-gray-600">
                        {formatNumber(feature.requests)} requests •{" "}
                        {formatCost(feature.cost)}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No feature usage data yet</p>
          )}
        </CardContent>
      </Card>

      {/* Usage by Model */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Usage by Model
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats.byModel.length > 0 ? (
            <div className="space-y-4">
              {stats.byModel.map((model) => (
                <div
                  key={model.model}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div>
                    <p className="font-medium">{model.model}</p>
                    <p className="text-sm text-gray-600">
                      {formatNumber(model.requests)} requests •{" "}
                      {formatNumber(model.tokens)} tokens
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-green-600">
                      {formatCost(model.cost)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No model usage data yet</p>
          )}
        </CardContent>
      </Card>

      {/* Token Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Token Usage Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-gray-600">Input Tokens</p>
              <p className="text-xl font-bold text-blue-600 mt-1">
                {formatNumber(stats.overall.promptTokens)}
              </p>
            </div>
            <div className="text-center p-4 bg-purple-50 rounded-lg">
              <p className="text-sm text-gray-600">Output Tokens</p>
              <p className="text-xl font-bold text-purple-600 mt-1">
                {formatNumber(stats.overall.completionTokens)}
              </p>
            </div>
            <div className="text-center p-4 bg-emerald-50 rounded-lg">
              <p className="text-sm text-gray-600">Avg Duration</p>
              <p className="text-xl font-bold text-emerald-600 mt-1">
                {(stats.overall.avgDuration / 1000).toFixed(2)}s
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
