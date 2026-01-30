"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { Button } from "@/components/ui/button";
import { Trash2, Loader2 } from "lucide-react";

interface RemoveSectionOverviewButtonProps {
  projectSlug: string;
  sectionSlug: string;
  sectionTitle: string;
}

export default function RemoveSectionOverviewButton({
  projectSlug,
  sectionSlug,
  sectionTitle,
}: RemoveSectionOverviewButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleRemove = async () => {
    setError("");
    setLoading(true);

    try {
      const response = await fetch(
        `/api/projects/${projectSlug}/section-overview?sectionSlug=${sectionSlug}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to remove overview");
      }

      // Refresh the page to show the section without overview
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-8 pt-6 border-t">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Remove Overview
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Section Overview?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the overview content for "{sectionTitle}".
              Child documents in this section will not be affected. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemove}
              disabled={loading}
              className="bg-red-600 hover:bg-red-700"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Removing...
                </>
              ) : (
                "Remove Overview"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
          {error && (
            <p className="text-sm text-red-500 mt-2">{error}</p>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
