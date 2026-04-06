"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GitBranch, Loader2, Save } from "lucide-react";

interface GitHubConfig {
  repo: string;
  token: string;
  branch: string;
}

export function GitHubSettings() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [config, setConfig] = useState<GitHubConfig>({ repo: "", token: "", branch: "main" });

  useEffect(() => {
    fetch("/api/settings/github")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) setConfig(data);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const handleSave = async () => {
    if (config.repo && !config.repo.includes("/")) {
      toast({
        title: "Invalid repository",
        description: "Repository must be in 'owner/repo' format",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch("/api/settings/github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      if (!res.ok) throw new Error("Failed to save");

      toast({ title: "Saved", description: "GitHub settings saved successfully" });
    } catch {
      toast({ title: "Error", description: "Failed to save GitHub settings", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <GitBranch className="h-5 w-5 text-gray-700" />
          <CardTitle>GitHub Integration</CardTitle>
        </div>
        <CardDescription>
          Configure GitHub credentials used to fetch codebase knowledge bases across all projects.
          The repository, token, and branch are shared globally — individual projects only specify
          the file path within the repository.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="gh-repo">Repository</Label>
          <Input
            id="gh-repo"
            type="text"
            value={config.repo}
            onChange={(e) => setConfig({ ...config, repo: e.target.value })}
            placeholder="owner/repository"
          />
          <p className="text-xs text-gray-500">
            The GitHub repository that contains knowledge base files, e.g.{" "}
            <code className="bg-gray-100 px-1 rounded">themegrill/knowledge-base</code>
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="gh-token">Personal Access Token</Label>
          <Input
            id="gh-token"
            type="password"
            value={config.token}
            onChange={(e) => setConfig({ ...config, token: e.target.value })}
            placeholder="ghp_xxxxxxxxxxxx"
          />
          <p className="text-xs text-gray-500">
            Required for private repositories. Leave blank for public repos.
            The token is stored securely in the database.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="gh-branch">Default Branch</Label>
          <Input
            id="gh-branch"
            type="text"
            value={config.branch}
            onChange={(e) => setConfig({ ...config, branch: e.target.value })}
            placeholder="main"
          />
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
            ) : (
              <><Save className="h-4 w-4 mr-2" />Save GitHub Settings</>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
