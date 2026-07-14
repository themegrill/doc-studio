"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Trash2, Loader2 } from "lucide-react";

interface DeleteDocumentButtonProps {
  projectSlug: string;
  documentSlug: string;
  documentTitle: string;
  isSectionOverview?: boolean;
}

export default function DeleteDocumentButton({
  projectSlug,
  documentSlug,
  documentTitle,
  isSectionOverview = false,
}: DeleteDocumentButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleDelete = async () => {
    setError("");
    setLoading(true);

    try {
      let response;

      if (isSectionOverview) {
        // Delete the entire section (including the overview and all child documents)
        response = await fetch(
          `/api/projects/${projectSlug}/sections/${documentSlug}`,
          {
            method: "DELETE",
          }
        );
      } else {
        // Delete just the document — include projectSlug so the API can scope to the right project
        response = await fetch(
          `/api/docs/${documentSlug}?projectSlug=${encodeURIComponent(projectSlug)}`,
          { method: "DELETE" },
        );
      }

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || `Failed to delete ${isSectionOverview ? "section" : "document"}`);
      }

      setOpen(false);

      if (isSectionOverview) {
        // Redirect to project docs root after deleting section
        window.location.href = `/projects/${projectSlug}/docs`;
      } else {
        // Get section slug from document slug (everything before the last /)
        const sectionSlug = documentSlug.includes("/")
          ? documentSlug.substring(0, documentSlug.lastIndexOf("/"))
          : "";

        // Redirect to section page or project docs root
        if (sectionSlug) {
          router.push(`/projects/${projectSlug}/docs/${sectionSlug}`);
        } else {
          window.location.href = `/projects/${projectSlug}/docs`;
        }
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to delete ${isSectionOverview ? "section" : "document"}`);
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        variant="outline"
        className="flex items-center gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
      >
        <Trash2 size={16} />
        Delete
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isSectionOverview ? "Delete Section" : "Move Document to Trash"}</DialogTitle>
            <DialogDescription>
              {isSectionOverview ? (
                <>
                  Are you sure you want to delete the section &quot;{documentTitle}&quot;? This will permanently delete the section and all documents within it. This action cannot be undone.
                </>
              ) : (
                <>
                  &quot;{documentTitle}&quot; will be moved to the Trash. You can restore it or permanently delete it later from the Trash.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={loading}
              className="flex items-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  {isSectionOverview ? "Deleting..." : "Moving..."}
                </>
              ) : (
                <>
                  <Trash2 size={16} />
                  {isSectionOverview ? "Delete Section" : "Move to Trash"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
