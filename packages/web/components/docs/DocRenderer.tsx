"use client";

import { useState, useEffect } from "react";
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import { DocContent } from "@/lib/db/ContentManager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Pencil,
  Eye,
  Save,
  Loader2,
  CheckCircle,
  AlertCircle,
  Link as LinkIcon,
} from "lucide-react";
import { useSession } from "next-auth/react";

//@ts-expect-error Ignore missing types
import "@blocknote/core/fonts/inter.css";
//@ts-expect-error Ignore missing types
import "@blocknote/mantine/style.css";

interface Props {
  doc: DocContent;
  slug: string;
}

interface EditorState {
  isEditing: boolean;
  title: string;
  description: string;
}

interface SaveState {
  isSaving: boolean;
  success: boolean;
  error: string;
}

export default function DocRenderer({ doc, slug }: Props) {
  const [editorState, setEditorState] = useState<EditorState>({
    isEditing: false,
    title: doc.title,
    description: doc.description || "",
  });

  const [saveState, setSaveState] = useState<SaveState>({
    isSaving: false,
    success: false,
    error: "",
  });

  const { data: session } = useSession();
  const isAuthenticated = !!session?.user;
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  // Add anchor links to headings
  useEffect(() => {
    if (editorState.isEditing) return;

    const addHeadingAnchors = () => {
      const headings = document.querySelectorAll(
        ".bn-editor h1, .bn-editor h2, .bn-editor h3, .bn-editor h4, .bn-editor h5, .bn-editor h6",
      );

      headings.forEach((heading) => {
        // Skip if already has anchor
        if (heading.querySelector(".heading-anchor")) return;

        const text = heading.textContent || "";
        const id = text
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "");

        heading.id = id;
        heading.classList.add("group", "relative");

        const anchor = document.createElement("a");
        anchor.href = `#${id}`;
        anchor.className =
          "heading-anchor absolute -left-6 top-0 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-blue-600";
        anchor.innerHTML = `<svg class="w-5 h-5 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>`;
        anchor.onclick = (e) => {
          e.preventDefault();
          const url = `${window.location.origin}${window.location.pathname}#${id}`;
          navigator.clipboard.writeText(url);
          setCopiedHash(id);
          setTimeout(() => setCopiedHash(null), 2000);
          window.history.pushState(null, "", `#${id}`);
          heading.scrollIntoView({ behavior: "smooth", block: "start" });
        };

        heading.insertBefore(anchor, heading.firstChild);
      });
    };

    // Run after a short delay to ensure BlockNote has rendered
    const timer = setTimeout(addHeadingAnchors, 100);

    return () => clearTimeout(timer);
  }, [editorState.isEditing, doc.blocks]);

  const editor = useCreateBlockNote({
    initialContent: doc.blocks.length > 0 ? doc.blocks : undefined,
    uploadFile: async (file: File) => {
      console.log("[DocRenderer] Uploading file:", file.name);

      const formData = new FormData();
      formData.append("file", file);

      try {
        const response = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const error = await response.json();
          console.error("[DocRenderer] Upload failed:", error);
          throw new Error(error.error || "Upload failed");
        }

        const data = await response.json();
        console.log("[DocRenderer] Upload successful:", data.url);
        return data.url;
      } catch (error) {
        console.error("[DocRenderer] Upload error:", error);
        throw error;
      }
    },
  });

  const handleSave = async () => {
    setSaveState({ isSaving: true, success: false, error: "" });

    console.log("[DocRenderer] Saving document:", {
      slug,
      title: editorState.title,
      description: editorState.description,
      blocksCount: editor.document.length,
    });

    try {
      const updatedDoc = {
        slug: doc.slug,
        title: editorState.title,
        description: editorState.description,
        blocks: editor.document,
      };

      const response = await fetch(`/api/docs/${slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedDoc),
      });

      if (response.ok) {
        console.log("[DocRenderer] Document saved successfully");
        setEditorState((prev) => ({ ...prev, isEditing: false }));
        setSaveState({ isSaving: false, success: true, error: "" });
        setTimeout(
          () => setSaveState((prev) => ({ ...prev, success: false })),
          3000,
        );
      } else {
        const data = await response.json();
        console.error("[DocRenderer] Save failed:", data.error);
        setSaveState({
          isSaving: false,
          success: false,
          error: data.error || "Save failed",
        });
      }
    } catch (error) {
      console.error("[DocRenderer] Save error:", error);
      setSaveState({
        isSaving: false,
        success: false,
        error: "Save failed. Please try again.",
      });
    }
  };

  return (
    <div className="max-w-[1000px] mx-auto">
      {/* Copy Link Notification */}
      {copiedHash && (
        <div className="fixed top-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 z-50">
          <LinkIcon size={16} />
          Link copied!
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-start mb-6 pb-4 border-b">
        <div className="flex-1 mr-4">
          {editorState.isEditing ? (
            <div className="space-y-3">
              <Input
                type="text"
                value={editorState.title}
                onChange={(e) =>
                  setEditorState((prev) => ({
                    ...prev,
                    title: e.target.value,
                  }))
                }
                className="text-3xl font-bold border-2 border-blue-200 focus:border-blue-400"
                placeholder="Document title"
              />
              <Input
                type="text"
                value={editorState.description}
                onChange={(e) =>
                  setEditorState((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                className="text-gray-600 border-2 border-blue-200 focus:border-blue-400"
                placeholder="Document description (optional)"
              />
            </div>
          ) : (
            <>
              <h1 className="text-3xl font-bold mb-2">{editorState.title}</h1>
              {editorState.description && (
                <p className="text-gray-600">{editorState.description}</p>
              )}
            </>
          )}
        </div>

        {isAuthenticated && !editorState.isEditing && (
          <Button
            onClick={() =>
              setEditorState((prev) => ({ ...prev, isEditing: true }))
            }
            variant="outline"
            className="flex items-center gap-2"
          >
            <Pencil size={16} />
            Edit
          </Button>
        )}
      </div>

      {/* Floating Action Bar - Only in Edit Mode */}
      {isAuthenticated && editorState.isEditing && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-white rounded-lg shadow-lg border border-gray-200 p-4 z-30">
          {saveState.success && (
            <div className="flex items-center gap-1 text-green-600 text-sm">
              <CheckCircle size={16} />
              Saved!
            </div>
          )}

          {saveState.error && (
            <div className="flex items-center gap-1 text-red-600 text-sm">
              <AlertCircle size={16} />
              {saveState.error}
            </div>
          )}

          <Button
            onClick={() => {
              setEditorState({
                isEditing: false,
                title: doc.title,
                description: doc.description || "",
              });
            }}
            variant="outline"
            className="flex items-center gap-2"
          >
            <Eye size={16} />
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saveState.isSaving}
            className="flex items-center gap-2"
          >
            {saveState.isSaving ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save size={16} />
                Save
              </>
            )}
          </Button>
        </div>
      )}

      {/* Editor */}
      <div
        className={`${editorState.isEditing ? "border rounded-lg p-6 bg-white" : ""}`}
      >
        <style jsx global>{`
          .bn-editor h1,
          .bn-editor h2,
          .bn-editor h3,
          .bn-editor h4,
          .bn-editor h5,
          .bn-editor h6 {
            position: relative;
            padding-left: 1.5rem;
            scroll-margin-top: 2rem;
          }
          .heading-anchor {
            position: absolute;
            left: 0;
            top: 0.25rem;
            opacity: 0;
            transition: opacity 0.2s;
            color: #9ca3af;
            text-decoration: none;
          }
          .heading-anchor:hover {
            color: #2563eb;
          }
          .group:hover .heading-anchor {
            opacity: 1;
          }
        `}</style>
        <BlockNoteView
          editor={editor}
          editable={editorState.isEditing}
          theme="light"
        />
      </div>

      {/* Metadata */}
      {doc.updatedAt && (
        <div className="mt-8 pt-4 border-t text-sm text-gray-500">
          Last updated: {new Date(doc.updatedAt).toLocaleString()}
        </div>
      )}
    </div>
  );
}
