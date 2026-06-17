"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Trash2, Save, Loader2, Upload, X, RefreshCw } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import Image from "next/image";

interface ProjectGeneralSettingsProps {
  projectSlug: string;
  projectId: string;
  projectName: string;
  projectDescription: string;
  projectMetadata: Record<string, any>;
  isSuperAdmin: boolean;
}

export function ProjectGeneralSettings({
  projectSlug,
  projectId: _projectId,
  projectName,
  projectDescription,
  projectMetadata,
  isSuperAdmin,
}: ProjectGeneralSettingsProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isUploadingFavicon, setIsUploadingFavicon] = useState(false);
  const [isClearingCache, setIsClearingCache] = useState(false);

  const [formData, setFormData] = useState({
    name: projectName,
    slug: projectSlug,
    description: projectDescription,
  });

  const [metadata, setMetadata] = useState(projectMetadata);

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.slug.trim()) {
      toast({
        title: "Error",
        description: "Name and slug are required",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch(`/api/projects/${projectSlug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, metadata, description: formData.description }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update project");
      }

      toast({
        title: "Success",
        description: "Project updated successfully",
      });

      // If slug changed, redirect to new URL
      if (formData.slug !== projectSlug) {
        router.push(`/projects/${formData.slug}/settings`);
      } else {
        router.refresh();
        setIsEditing(false);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update project",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);

    try {
      const response = await fetch(`/api/projects/${projectSlug}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete project");
      }

      toast({
        title: "Success",
        description: "Project deleted successfully",
      });

      router.push("/projects");
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete project",
        variant: "destructive",
      });
      setIsDeleting(false);
    }
  };

  const slugify = (text: string) => {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Error",
        description: "Please upload an image file",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: "Error",
        description: "Image must be less than 2MB",
        variant: "destructive",
      });
      return;
    }

    setIsUploadingLogo(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to upload logo");
      }

      const { url } = await response.json();
      const updatedMetadata = { ...metadata, logo: url };
      setMetadata(updatedMetadata);

      // Auto-save the metadata to database
      const saveResponse = await fetch(`/api/projects/${projectSlug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: projectName, // Use props instead of state
          slug: projectSlug,
          metadata: updatedMetadata,
        }),
      });

      if (!saveResponse.ok) {
        const errorData = await saveResponse.json();
        console.error("Save error:", errorData);
        throw new Error(errorData.error || "Failed to save logo");
      }

      toast({
        title: "Success",
        description: "Logo uploaded and saved successfully",
      });

      router.refresh(); // Refresh to show updated logo
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to upload logo",
        variant: "destructive",
      });
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleRemoveLogo = async () => {
    try {
      const updatedMetadata = { ...metadata, logo: "" };
      setMetadata(updatedMetadata);

      // Auto-save the metadata to database
      const response = await fetch(`/api/projects/${projectSlug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: projectName, // Use props instead of state
          slug: projectSlug,
          metadata: updatedMetadata,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Remove error:", errorData);
        throw new Error(errorData.error || "Failed to remove logo");
      }

      toast({
        title: "Success",
        description: "Logo removed successfully",
      });

      router.refresh(); // Refresh to show updated state
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to remove logo",
        variant: "destructive",
      });
    }
  };

  const handleFaviconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({
        title: "Error",
        description: "Please upload an image file",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 1 * 1024 * 1024) {
      toast({
        title: "Error",
        description: "Favicon must be less than 1MB",
        variant: "destructive",
      });
      return;
    }

    setIsUploadingFavicon(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Failed to upload favicon");

      const { url } = await response.json();
      const updatedMetadata = { ...metadata, favicon: url };
      setMetadata(updatedMetadata);

      const saveResponse = await fetch(`/api/projects/${projectSlug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: projectName, slug: projectSlug, metadata: updatedMetadata }),
      });

      if (!saveResponse.ok) {
        const errorData = await saveResponse.json();
        throw new Error(errorData.error || "Failed to save favicon");
      }

      toast({ title: "Success", description: "Favicon uploaded and saved successfully" });
      router.refresh();
    } catch (error) {
      toast({ title: "Error", description: "Failed to upload favicon", variant: "destructive" });
    } finally {
      setIsUploadingFavicon(false);
    }
  };

  const handleClearCache = async () => {
    setIsClearingCache(true);
    try {
      const res = await fetch(
        `/api/projects/${projectSlug}/knowledge-base/cache`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error((await res.json()).error || "Failed to clear cache");
      toast({ title: "Cache cleared", description: "The prompt cache for this project has been reset." });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to clear cache",
        variant: "destructive",
      });
    } finally {
      setIsClearingCache(false);
    }
  };

  const handleRemoveFavicon = async () => {
    try {
      const updatedMetadata = { ...metadata, favicon: "" };
      setMetadata(updatedMetadata);

      const response = await fetch(`/api/projects/${projectSlug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: projectName, slug: projectSlug, metadata: updatedMetadata }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to remove favicon");
      }

      toast({ title: "Success", description: "Favicon removed successfully" });
      router.refresh();
    } catch (error) {
      toast({ title: "Error", description: "Failed to remove favicon", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      {/* Project Details */}
      <div className="bg-white border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Project Details</h3>
          {!isEditing && isSuperAdmin && (
            <Button onClick={() => setIsEditing(true)} size="sm">
              Edit
            </Button>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <Label htmlFor="name">Project Name</Label>
            {isEditing ? (
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => {
                  setFormData({
                    ...formData,
                    name: e.target.value,
                    slug: slugify(e.target.value),
                  });
                }}
                placeholder="My Project"
                className="mt-1"
              />
            ) : (
              <p className="mt-1 text-sm text-gray-900">{projectName}</p>
            )}
          </div>

          <div>
            <Label htmlFor="slug">Project Slug</Label>
            {isEditing ? (
              <Input
                id="slug"
                value={formData.slug}
                onChange={(e) =>
                  setFormData({ ...formData, slug: slugify(e.target.value) })
                }
                placeholder="my-project"
                className="mt-1"
              />
            ) : (
              <p className="mt-1 text-sm text-gray-900">{projectSlug}</p>
            )}
            <p className="text-xs text-gray-500 mt-1">
              Used in URLs: /projects/{isEditing ? formData.slug : projectSlug}
            </p>
          </div>

          <div>
            <Label htmlFor="description">Project Description</Label>
            {isEditing ? (
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="A short description of this project"
                className="mt-1"
                rows={3}
              />
            ) : (
              <p className="mt-1 text-sm text-gray-900">
                {projectDescription || <span className="text-gray-400">No description</span>}
              </p>
            )}
          </div>

          {/* Nav links */}
          <div className="pt-2 border-t space-y-3">
            <div>
              <Label htmlFor="nav-website">Website URL</Label>
              {isEditing ? (
                <Input
                  id="nav-website"
                  value={metadata.nav_website ?? ""}
                  onChange={(e) => setMetadata({ ...metadata, nav_website: e.target.value })}
                  placeholder="https://example.com"
                  className="mt-1"
                />
              ) : (
                <p className="mt-1 text-sm text-gray-900">{metadata.nav_website || <span className="text-gray-400">Not set</span>}</p>
              )}
            </div>
            <div>
              <Label htmlFor="nav-changelog">Changelog URL</Label>
              {isEditing ? (
                <Input
                  id="nav-changelog"
                  value={metadata.nav_changelog ?? ""}
                  onChange={(e) => setMetadata({ ...metadata, nav_changelog: e.target.value })}
                  placeholder="https://example.com/changelog"
                  className="mt-1"
                />
              ) : (
                <p className="mt-1 text-sm text-gray-900">{metadata.nav_changelog || <span className="text-gray-400">Not set</span>}</p>
              )}
            </div>
            <div>
              <Label htmlFor="nav-cta">Get {formData.name} URL</Label>
              {isEditing ? (
                <Input
                  id="nav-cta"
                  value={metadata.nav_cta ?? ""}
                  onChange={(e) => setMetadata({ ...metadata, nav_cta: e.target.value })}
                  placeholder="https://example.com/pricing"
                  className="mt-1"
                />
              ) : (
                <p className="mt-1 text-sm text-gray-900">{metadata.nav_cta || <span className="text-gray-400">Not set</span>}</p>
              )}
            </div>
          </div>

          {isEditing && (
            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setIsEditing(false);
                  setFormData({
                    name: projectName,
                    slug: projectSlug,
                    description: projectDescription,
                  });
                  setMetadata(projectMetadata);
                }}
                disabled={isSaving}
              >
                Cancel
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Project Logo */}
      <div className="bg-white border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">Project Logo</h3>
            <p className="text-sm text-gray-600 mt-1">
              Upload a logo to display for this project (recommended: 150x40px)
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {metadata.logo && (
            <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-md">
              <div className="relative h-10 w-40 flex items-center justify-center bg-white border rounded">
                <Image
                  src={metadata.logo}
                  alt="Project logo"
                  width={150}
                  height={40}
                  className="object-contain max-h-10"
                />
              </div>
              {isSuperAdmin && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRemoveLogo}
                  disabled={isUploadingLogo}
                >
                  <X className="h-4 w-4 mr-1" />
                  Remove
                </Button>
              )}
            </div>
          )}

          {isSuperAdmin && (
            <div>
              <Label htmlFor="logo" className="sr-only">
                Upload Logo
              </Label>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isUploadingLogo}
                  onClick={() => document.getElementById("logo-upload")?.click()}
                >
                  {isUploadingLogo ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      {metadata.logo ? "Change Logo" : "Upload Logo"}
                    </>
                  )}
                </Button>
                <input
                  id="logo-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
              </div>
              <p className="text-xs text-gray-500 mt-2">
                PNG, JPG, or SVG. Max 2MB. Recommended size: 150x40px
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Project Favicon */}
      <div className="bg-white border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">Project Favicon</h3>
            <p className="text-sm text-gray-600 mt-1">
              Upload a favicon to display in the browser tab (recommended: 32x32px ICO, PNG, or SVG)
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {metadata.favicon && (
            <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-md">
              <div className="relative h-8 w-8 flex items-center justify-center bg-white border rounded">
                <Image
                  src={metadata.favicon}
                  alt="Project favicon"
                  width={32}
                  height={32}
                  className="object-contain max-h-8"
                />
              </div>
              {isSuperAdmin && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRemoveFavicon}
                  disabled={isUploadingFavicon}
                >
                  <X className="h-4 w-4 mr-1" />
                  Remove
                </Button>
              )}
            </div>
          )}

          {isSuperAdmin && (
            <div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isUploadingFavicon}
                  onClick={() => document.getElementById("favicon-upload")?.click()}
                >
                  {isUploadingFavicon ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      {metadata.favicon ? "Change Favicon" : "Upload Favicon"}
                    </>
                  )}
                </Button>
                <input
                  id="favicon-upload"
                  type="file"
                  accept="image/x-icon,image/png,image/svg+xml,image/jpeg"
                  onChange={handleFaviconUpload}
                  className="hidden"
                />
              </div>
              <p className="text-xs text-gray-500 mt-2">
                ICO, PNG, or SVG. Max 1MB. Recommended size: 32x32px
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Prompt Cache */}
      {isSuperAdmin && (
        <div className="bg-white border rounded-lg p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold">Prompt Cache</h3>
              <p className="text-sm text-gray-600 mt-1">
                Force the AI chat to reload all knowledge bases from the database on the next
                request. Use this if a recent knowledge base update is not reflected in chat
                responses.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearCache}
              disabled={isClearingCache}
              className="shrink-0 mt-1"
            >
              {isClearingCache ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Clearing...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Clear Cache
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Danger Zone */}
      {isSuperAdmin && (
        <div className="bg-white border border-red-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-red-600 mb-2">Danger Zone</h3>
          <p className="text-sm text-gray-600 mb-4">
            Once you delete a project, there is no going back. All documentation, members, and
            settings will be permanently deleted.
          </p>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={isDeleting}>
                {isDeleting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Project
                  </>
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete the project{" "}
                  <strong>{projectName}</strong> and remove all associated data including:
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>All documentation and pages</li>
                    <li>All project members</li>
                    <li>All navigation and settings</li>
                  </ul>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-red-600 hover:bg-red-700"
                >
                  Delete Project
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}
