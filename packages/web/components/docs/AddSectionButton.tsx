"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useGuidelines, useProjectSections } from "@/hooks/use-editorial";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";

interface AddSectionButtonProps {
  projectSlug: string;
}

export default function AddSectionButton({
  projectSlug,
}: AddSectionButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [createDescription, setCreateDescription] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Categories should reflect how users search, not how our plugins are
  // structured (DOCSTUDIO-45 §4.2). Free text stays possible — a genuinely new
  // category is sometimes needed — but it warns and asks for confirmation.
  const { guidelines } = useGuidelines(projectSlug);
  // Only fetched once the dialog is open; nothing needs it before then.
  const { titles: sections } = useProjectSections(open ? projectSlug : null);
  const [confirmedNewCategory, setConfirmedNewCategory] = useState(false);

  // An explicit list from Marketing wins. With none configured, this project's
  // own sections are its approved categories, so each product gets the right
  // behaviour without anyone filling in a form.
  const configured = guidelines.categories.allowed;
  const usingExistingSections = configured.length === 0;
  const approved = usingExistingSections ? sections : configured;

  const isApproved =
    !title.trim() ||
    approved.some((c) => c.toLowerCase() === title.trim().toLowerCase());
  const needsConfirmation =
    guidelines.categories.warnOnNew &&
    approved.length > 0 &&
    !isApproved &&
    !confirmedNewCategory;

  const handleTitleChange = (value: string) => {
    setConfirmedNewCategory(false);
    setTitle(value);
    // Auto-generate slug from title
    const autoSlug = value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    setSlug(autoSlug);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (needsConfirmation) return;
    setError("");
    setLoading(true);

    try {
      const response = await fetch(`/api/projects/${projectSlug}/sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, slug, createDescription }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create section");
      }

      setOpen(false);
      setTitle("");
      setSlug("");
      setCreateDescription(true);
      setConfirmedNewCategory(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create section");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors">
          <Plus className="h-4 w-4" />
          <span>Add Section</span>
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Section</DialogTitle>
          <DialogDescription>
            Create a new section to organize your documentation.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Section Title</Label>
            <Input
              id="title"
              list="approved-categories"
              placeholder={approved[0] ? `e.g., ${approved[0]}` : "e.g., Getting Started"}
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              required
            />
            {approved.length > 0 && (
              <datalist id="approved-categories">
                {approved.map((category) => (
                  <option key={category} value={category} />
                ))}
              </datalist>
            )}

            {approved.length > 0 && isApproved && title.trim() && (
              <p className="text-xs text-emerald-600">
                {usingExistingSections
                  ? "Reuses an existing category"
                  : "Approved category"}
              </p>
            )}

            {approved.length > 0 && !isApproved && title.trim() && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 space-y-1.5">
                <p className="text-xs text-amber-800">
                  &ldquo;{title.trim()}&rdquo; is a new category. New categories
                  need Marketing sign-off — reuse an existing one where it fits.
                </p>
                <p className="text-xs text-amber-700">
                  {usingExistingSections ? "Existing" : "Approved"}:{" "}
                  {approved.join(" · ")}
                </p>
                <label className="flex items-center gap-2 pt-0.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmedNewCategory}
                    onChange={(e) => setConfirmedNewCategory(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-amber-300"
                  />
                  <span className="text-xs font-medium text-amber-800">
                    Create it anyway
                  </span>
                </label>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="slug">URL Slug</Label>
            <Input
              id="slug"
              placeholder="e.g., getting-started"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              required
            />
            <p className="text-xs text-gray-500">
              URL: /docs/{slug || "section-slug"}
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="createDescription"
              checked={createDescription}
              onChange={(e) => setCreateDescription(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label
              htmlFor="createDescription"
              className="text-sm font-normal cursor-pointer"
            >
              Create section overview page
            </Label>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading || needsConfirmation}>
              {loading ? "Creating..." : "Create Section"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
