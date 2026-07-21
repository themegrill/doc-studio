"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Loader2, Save, Upload, X } from "lucide-react";

interface OrganizationConfig {
  name: string;
  logo: string;
  url: string;
}

export function OrganizationSettings() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [config, setConfig] = useState<OrganizationConfig>({ name: "", logo: "", url: "" });

  useEffect(() => {
    fetch("/api/organization")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setConfig(data);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const saveConfig = async (next: OrganizationConfig) => {
    const res = await fetch("/api/organization", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    if (!res.ok) throw new Error("Failed to save");
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveConfig(config);
      toast({ title: "Saved", description: "Organization settings saved successfully" });
    } catch {
      toast({ title: "Error", description: "Failed to save organization settings", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "File too large", description: "Image must be less than 2MB", variant: "destructive" });
      return;
    }

    setIsUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
      if (!uploadRes.ok) throw new Error("Failed to upload logo");

      const { url } = await uploadRes.json();
      const next = { ...config, logo: url };
      setConfig(next);
      await saveConfig(next);

      toast({ title: "Success", description: "Logo uploaded and saved successfully" });
    } catch {
      toast({ title: "Error", description: "Failed to upload logo", variant: "destructive" });
    } finally {
      setIsUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemoveLogo = async () => {
    const next = { ...config, logo: "" };
    setConfig(next);
    try {
      await saveConfig(next);
      toast({ title: "Success", description: "Logo removed successfully" });
    } catch {
      toast({ title: "Error", description: "Failed to remove logo", variant: "destructive" });
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
          <Building2 className="h-5 w-5 text-gray-700" />
          <CardTitle>Organization</CardTitle>
        </div>
        <CardDescription>
          Shared identity for all projects hosted on this instance. Used as the fallback
          for social preview images and as the Organization/WebSite identity in structured
          data (JSON-LD) when a project or document doesn&apos;t set its own.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="org-name">Organization Name</Label>
          <Input
            id="org-name"
            type="text"
            value={config.name}
            onChange={(e) => setConfig({ ...config, name: e.target.value })}
            placeholder="Acme Inc."
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="org-url">Website URL</Label>
          <Input
            id="org-url"
            type="text"
            value={config.url}
            onChange={(e) => setConfig({ ...config, url: e.target.value })}
            placeholder="https://example.com"
          />
        </div>

        <div className="space-y-2">
          <Label>Logo</Label>
          {config.logo && (
            <div className="flex items-center gap-3 mb-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={config.logo}
                alt="Organization logo"
                className="h-12 w-auto rounded border border-gray-200 bg-white p-1"
              />
              <Button variant="outline" size="sm" onClick={handleRemoveLogo}>
                <X className="h-3.5 w-3.5 mr-1.5" />
                Remove
              </Button>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleLogoUpload}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploadingLogo}
          >
            {isUploadingLogo ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Uploading...</>
            ) : (
              <><Upload className="h-4 w-4 mr-2" />{config.logo ? "Change Logo" : "Upload Logo"}</>
            )}
          </Button>
          <p className="text-xs text-gray-500">Recommended: square image, at least 112x112px.</p>
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
            ) : (
              <><Save className="h-4 w-4 mr-2" />Save Organization Settings</>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
