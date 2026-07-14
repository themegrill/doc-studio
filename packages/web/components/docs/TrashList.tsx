"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Trash2, RotateCcw, Loader2, FileText } from "lucide-react";
import { parseTitleWithBadges } from "@/lib/parse-title-badges";
import { Badge } from "@/components/ui/badge-pro";

export interface TrashedDoc {
  id?: string;
  slug: string;
  title: string;
  description?: string;
  updatedAt?: string;
}

interface TrashListProps {
  projectSlug: string;
  documents: TrashedDoc[];
}

export default function TrashList({ projectSlug, documents }: TrashListProps) {
  const router = useRouter();
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [purgeTarget, setPurgeTarget] = useState<TrashedDoc | null>(null);

  const act = async (slug: string, action: "restore" | "purge") => {
    setError("");
    setBusySlug(slug);
    try {
      const response = await fetch(`/api/projects/${projectSlug}/trash`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, slug }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || `Failed to ${action} document`);
      }
      setPurgeTarget(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} document`);
    } finally {
      setBusySlug(null);
    }
  };

  if (documents.length === 0) {
    return (
      <div className="text-center py-12 border-2 border-dashed rounded-lg">
        <Trash2 className="h-12 w-12 mx-auto text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Trash is empty</h3>
        <p className="text-gray-500">
          Documents you delete are moved here and can be restored.
        </p>
      </div>
    );
  }

  return (
    <>
      {error && <p className="text-sm text-red-500 mb-4">{error}</p>}
      <div className="space-y-3">
        {documents.map((doc) => {
          const busy = busySlug === doc.slug;
          const { cleanTitle, badges } = parseTitleWithBadges(doc.title);
          return (
            <Card key={doc.slug} className="flex flex-row items-center justify-between gap-4">
              <CardHeader className="flex-1 min-w-0">
                <CardTitle className="line-clamp-1 leading-snug flex items-center gap-2">
                  <FileText size={16} className="shrink-0 text-gray-400" />
                  {cleanTitle}
                  {badges.map((badge, i) => (
                    <Badge key={i} variant={badge.variant} className="text-[10px] px-1.5 py-0 shrink-0">
                      {badge.text}
                    </Badge>
                  ))}
                </CardTitle>
                <CardDescription className="mt-1 line-clamp-1">
                  /{doc.slug}
                </CardDescription>
              </CardHeader>
              <div className="flex items-center gap-2 pr-6">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => act(doc.slug, "restore")}
                  className="flex items-center gap-1.5"
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                  Restore
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => setPurgeTarget(doc)}
                  className="flex items-center gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 size={14} />
                  Delete Permanently
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!purgeTarget} onOpenChange={(open) => !open && setPurgeTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Permanently</DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete &quot;{purgeTarget?.title}&quot;?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPurgeTarget(null)}
              disabled={!!busySlug}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => purgeTarget && act(purgeTarget.slug, "purge")}
              disabled={!!busySlug}
              className="flex items-center gap-2"
            >
              {busySlug ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 size={16} />
                  Delete Permanently
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
