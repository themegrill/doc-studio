"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BarChart3, Code2, ExternalLink, MessageCircle, Search, TrendingUp } from "lucide-react";

interface Integrations {
  crispWebsiteId?: string;
  ga4MeasurementId?: string;
  googleSiteVerification?: string;
  microsoftClarityId?: string;
  customHeadCode?: string;
  customBodyCode?: string;
}

interface IntegrationsSettingsProps {
  projectSlug: string;
  initialIntegrations: Integrations;
}

export function IntegrationsSettings({ projectSlug, initialIntegrations }: IntegrationsSettingsProps) {
  const [crispWebsiteId, setCrispWebsiteId] = useState(initialIntegrations.crispWebsiteId ?? "");
  const [ga4MeasurementId, setGa4MeasurementId] = useState(initialIntegrations.ga4MeasurementId ?? "");
  const [googleSiteVerification, setGoogleSiteVerification] = useState(
    initialIntegrations.googleSiteVerification ?? ""
  );
  const [microsoftClarityId, setMicrosoftClarityId] = useState(initialIntegrations.microsoftClarityId ?? "");
  const [customHeadCode, setCustomHeadCode] = useState(initialIntegrations.customHeadCode ?? "");
  const [customBodyCode, setCustomBodyCode] = useState(initialIntegrations.customBodyCode ?? "");
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
        body: JSON.stringify({
          integrations: {
            crispWebsiteId: crispWebsiteId.trim(),
            ga4MeasurementId: ga4MeasurementId.trim(),
            googleSiteVerification: googleSiteVerification.trim(),
            microsoftClarityId: microsoftClarityId.trim(),
            customHeadCode: customHeadCode.trim(),
            customBodyCode: customBodyCode.trim(),
          },
        }),
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

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Website ID</label>
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
      </div>

      {/* Google Analytics 4 */}
      <div className="border rounded-lg p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="h-9 w-9 rounded-md bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
            <BarChart3 className="h-5 w-5 text-amber-500" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 leading-tight">Google Analytics 4</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Track page views and visitor behavior on your documentation site with GA4.
            </p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Measurement ID</label>
          <Input
            value={ga4MeasurementId}
            onChange={(e) => setGa4MeasurementId(e.target.value)}
            placeholder="G-XXXXXXXXXX"
            className="font-mono text-sm max-w-md"
          />
          <p className="text-xs text-gray-400 mt-1.5">
            Found in Google Analytics under{" "}
            <span className="font-medium text-gray-500">Admin → Data Streams → your stream</span>. Leave
            blank to disable.
          </p>
        </div>
      </div>

      {/* Google Search Console */}
      <div className="border rounded-lg p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="h-9 w-9 rounded-md bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
            <Search className="h-5 w-5 text-blue-500" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 leading-tight">Google Search Console</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Verify ownership of your documentation site so it can appear in Google Search reports.
            </p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Verification code</label>
          <Input
            value={googleSiteVerification}
            onChange={(e) => setGoogleSiteVerification(e.target.value)}
            placeholder="content value from the HTML tag"
            className="font-mono text-sm max-w-md"
          />
          <p className="text-xs text-gray-400 mt-1.5">
            In Search Console choose the{" "}
            <span className="font-medium text-gray-500">HTML tag</span> method and paste the{" "}
            <span className="font-medium text-gray-500">content</span> value (or the whole meta tag).
            Leave blank to disable.
          </p>
        </div>
      </div>

      {/* Microsoft Clarity */}
      <div className="border rounded-lg p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="h-9 w-9 rounded-md bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
            <TrendingUp className="h-5 w-5 text-indigo-500" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 leading-tight">Microsoft Clarity</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Capture heatmaps and session recordings to understand how visitors use your docs.
            </p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Project ID</label>
          <Input
            value={microsoftClarityId}
            onChange={(e) => setMicrosoftClarityId(e.target.value)}
            placeholder="abcd1234ef"
            className="font-mono text-sm max-w-md"
          />
          <p className="text-xs text-gray-400 mt-1.5">
            Found in Clarity under{" "}
            <span className="font-medium text-gray-500">Settings → Overview → Clarity project ID</span>.
            Leave blank to disable.
          </p>
        </div>
      </div>

      {/* Custom Code */}
      <div className="border rounded-lg p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="h-9 w-9 rounded-md bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
            <Code2 className="h-5 w-5 text-slate-500" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 leading-tight">Google Tag Manager</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Paste raw <span className="font-mono text-xs">&lt;script&gt;</span> /{" "}
              <span className="font-mono text-xs">&lt;meta&gt;</span> tags (e.g. Google Tag Manager) to run on
              every doc page.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Header code</label>
            <Textarea
              value={customHeadCode}
              onChange={(e) => setCustomHeadCode(e.target.value)}
              placeholder={"<!-- loaded in <head> -->\n<script>/* ... */</script>"}
              rows={6}
              className="font-mono text-xs"
            />
            <p className="text-xs text-gray-400 mt-1.5">
              Injected into the page <span className="font-medium text-gray-500">&lt;head&gt;</span>. For
              search-engine verification, prefer the dedicated Google Search Console field above.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Footer code</label>
            <Textarea
              value={customBodyCode}
              onChange={(e) => setCustomBodyCode(e.target.value)}
              placeholder={"<!-- loaded at end of <body> -->\n<script>/* ... */</script>"}
              rows={6}
              className="font-mono text-xs"
            />
            <p className="text-xs text-gray-400 mt-1.5">
              Injected at the end of <span className="font-medium text-gray-500">&lt;body&gt;</span>. Leave
              blank to disable.
            </p>
          </div>
        </div>
      </div>

      {/* Shared save bar */}
      <div className="flex items-center gap-3">
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
  );
}
