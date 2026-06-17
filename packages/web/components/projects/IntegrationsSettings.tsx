"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ExternalLink, MessageCircle } from "lucide-react";

interface Integrations {
  crispWebsiteId?: string;
}

interface IntegrationsSettingsProps {
  projectSlug: string;
  initialIntegrations: Integrations;
}

export function IntegrationsSettings({ projectSlug, initialIntegrations }: IntegrationsSettingsProps) {
  const [crispWebsiteId, setCrispWebsiteId] = useState(initialIntegrations.crispWebsiteId ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/projects/${projectSlug}/integrations`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ integrations: { crispWebsiteId: crispWebsiteId.trim() } }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to save. Please try again.");
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Crisp Chat */}
      <div className="border rounded-lg p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="h-9 w-9 rounded-md bg-orange-50 border border-orange-100 flex items-center justify-center shrink-0">
            <MessageCircle className="h-5 w-5 text-orange-500" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 leading-tight">Crisp Chat</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Add a live chat widget to your documentation site so visitors can ask questions in real time.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Website ID
            </label>
            <Input
              value={crispWebsiteId}
              onChange={(e) => setCrispWebsiteId(e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="font-mono text-sm max-w-md"
            />
            <p className="text-xs text-gray-400 mt-1.5">
              Found in your Crisp dashboard under{" "}
              <span className="font-medium text-gray-500">Settings → Website Settings → Setup Instructions</span>.
              Leave blank to disable.
            </p>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
            {saved && <span className="text-sm text-green-600 font-medium">Saved</span>}
            {error && <span className="text-sm text-red-500">{error}</span>}
            <a
              href="https://app.crisp.chat"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
            >
              Open Crisp dashboard
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
