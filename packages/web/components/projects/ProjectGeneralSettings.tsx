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
import { Trash2, Save, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ProjectGeneralSettingsProps {
  projectSlug: string;
  projectId: string;
  projectName: string;
  isSuperAdmin: boolean;
}

export function ProjectGeneralSettings({
  projectSlug,
  projectId,
  projectName,
  isSuperAdmin,
}: ProjectGeneralSettingsProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [formData, setFormData] = useState({
    name: projectName,
    slug: projectSlug,
  });

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
        body: JSON.stringify(formData),
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
                  setFormData({ name: projectName, slug: projectSlug });
                }}
                disabled={isSaving}
              >
                Cancel
              </Button>
            </div>
          )}
        </div>
      </div>

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
