"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Plus, Loader2 } from "lucide-react";

interface AddSectionOverviewButtonProps {
  projectSlug: string;
  sectionSlug: string;
  sectionTitle: string;
}

export default function AddSectionOverviewButton({
  projectSlug,
  sectionSlug,
  sectionTitle,
}: AddSectionOverviewButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleCreate = async () => {
    setError("");
    setLoading(true);

    try {
      const response = await fetch(
        `/api/projects/${projectSlug}/section-overview`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sectionSlug,
            title: sectionTitle,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create overview");
      }

      // Refresh the page to show the new overview
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mb-6">
      <div className="border-2 border-dashed rounded-lg p-6 text-center">
        <div className="max-w-md mx-auto">
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Add Section Overview
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            Create an introduction or overview page for this section with rich
            content using the editor.
          </p>
          <Button
            onClick={handleCreate}
            disabled={loading}
            className="gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                Add Overview Page
              </>
            )}
          </Button>
          {error && (
            <p className="text-sm text-red-500 mt-2">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
