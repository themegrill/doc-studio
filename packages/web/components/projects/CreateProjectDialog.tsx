"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Loader2, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";

export function CreateProjectDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [knowledgeBaseFile, setKnowledgeBaseFile] = useState<File | null>(null);
  const [knowledgeBaseData, setKnowledgeBaseData] = useState<any>(null);
  const router = useRouter();
  const { toast } = useToast();

  // Auto-generate slug from name
  const handleNameChange = (value: string) => {
    setName(value);
    if (!slug) {
      const generatedSlug = value
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .trim();
      setSlug(generatedSlug);
    }
  };

  // Handle knowledge base file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".json")) {
      toast({
        title: "Invalid file type",
        description: "Please upload a JSON file",
        variant: "destructive",
      });
      return;
    }

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      setKnowledgeBaseFile(file);
      setKnowledgeBaseData(data);
      toast({
        title: "Knowledge base loaded",
        description: "File successfully uploaded and parsed",
      });
    } catch (error) {
      toast({
        title: "Invalid JSON",
        description: "The file contains invalid JSON",
        variant: "destructive",
      });
    }
  };

  const removeKnowledgeBase = () => {
    setKnowledgeBaseFile(null);
    setKnowledgeBaseData(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          slug,
          description,
          knowledgeBase: knowledgeBaseData,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create project");
      }

      toast({
        title: "Project created",
        description: `${name} has been created successfully`,
      });

      setOpen(false);
      resetForm();
      router.refresh();

      // Navigate to the new project
      router.push(`/projects/${slug}/docs`);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create project",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setName("");
    setSlug("");
    setDescription("");
    setKnowledgeBaseFile(null);
    setKnowledgeBaseData(null);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg" className="gap-2">
          <Plus className="h-5 w-5" />
          Create New Project
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
            <DialogDescription>
              Create a new documentation project. Add details below to get started.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">
                Project Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                placeholder="My Awesome Product"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="slug">
                Project Slug <span className="text-red-500">*</span>
              </Label>
              <Input
                id="slug"
                placeholder="my-awesome-product"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                required
                pattern="[a-z0-9-]+"
                title="Only lowercase letters, numbers, and hyphens allowed"
              />
              <p className="text-xs text-gray-500">
                Used in URLs. Only lowercase letters, numbers, and hyphens.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="A brief description of your project..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="knowledgeBase">
                Knowledge Base (Optional)
              </Label>
              <div className="flex flex-col gap-2">
                {!knowledgeBaseFile ? (
                  <div className="flex items-center gap-2">
                    <Input
                      id="knowledgeBase"
                      type="file"
                      accept=".json"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        document.getElementById("knowledgeBase")?.click()
                      }
                      className="w-full gap-2"
                    >
                      <Upload className="h-4 w-4" />
                      Upload Knowledge Base JSON
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 p-2 border rounded-md bg-gray-50">
                    <div className="flex-1">
                      <p className="text-sm font-medium">{knowledgeBaseFile.name}</p>
                      <p className="text-xs text-gray-500">
                        {(knowledgeBaseFile.size / 1024).toFixed(2)} KB
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={removeKnowledgeBase}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
                <p className="text-xs text-gray-500">
                  Upload a JSON file containing product information, terminology, and writing guidelines.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !name || !slug}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
