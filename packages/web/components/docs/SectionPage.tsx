"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Save, Eye, Loader2, Sparkles } from "lucide-react";
import { useSession } from "next-auth/react";
import DeleteSectionButton from "@/components/docs/DeleteSectionButton";
import ChatPanel from "@/components/chat/ChatPanel";

interface SectionPageProps {
  projectSlug: string;
  sectionSlug: string;
  sectionTitle: string;
}

export default function SectionPage({
  projectSlug,
  sectionSlug,
  sectionTitle,
}: SectionPageProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const isAuthenticated = !!session?.user;
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(sectionTitle);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Initialize chat state from localStorage
  const [chatOpen, setChatOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('chatOpen');
      return saved === 'true';
    }
    return false;
  });

  // Save chat state to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('chatOpen', String(chatOpen));
    }
  }, [chatOpen]);

  // Document context for AI chat
  const documentContext = {
    title: sectionTitle,
    description: `Section page for ${sectionTitle}`,
    blocksPreview: "",
  };

  const handleSave = async () => {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const response = await fetch(
        `/api/projects/${projectSlug}/sections/${sectionSlug}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to update section");
      }

      setIsEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update section");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setTitle(sectionTitle);
    setError("");
    setIsEditing(false);
  };

  return (
    <div className="max-w-[1000px] mx-auto">
      {/* Header */}
      <div className="flex justify-between items-start mb-6 pb-4 border-b">
        <div className="flex-1 mr-4">
          {isEditing ? (
            <div className="space-y-3">
              <Input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                  if (e.key === "Escape") handleCancel();
                }}
                className="text-3xl font-bold border-2 border-blue-200 focus:border-blue-400"
                placeholder="Section title"
                autoFocus
                disabled={loading}
              />
              <p className="text-sm text-gray-500">
                Editing section title (press Enter to save, Esc to cancel)
              </p>
              {error && <p className="text-sm text-red-500">{error}</p>}
            </div>
          ) : (
            <h1 className="text-3xl font-bold mb-2">{sectionTitle}</h1>
          )}
        </div>

        {isAuthenticated && !isEditing && (
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setIsEditing(true)}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Pencil size={16} />
              Edit
            </Button>
            <DeleteSectionButton
              projectSlug={projectSlug}
              sectionSlug={sectionSlug}
              sectionTitle={sectionTitle}
            />
          </div>
        )}
      </div>

      {/* Floating Action Bar - Only in Edit Mode */}
      {isAuthenticated && isEditing && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-white rounded-lg shadow-lg border border-gray-200 p-4 z-30">
          {error && (
            <div className="flex items-center gap-1 text-red-600 text-sm">
              {error}
            </div>
          )}

          <Button
            onClick={handleCancel}
            variant="outline"
            className="flex items-center gap-2"
            disabled={loading}
          >
            <Eye size={16} />
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={loading}
            className="flex items-center gap-2"
          >
            {loading ? (
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

      {/* AI Chat Assistant */}
      {isAuthenticated && (
        <>
          {chatOpen ? (
            <ChatPanel
              documentContext={documentContext}
              onClose={() => setChatOpen(false)}
            />
          ) : (
            <Button
              onClick={() => setChatOpen(true)}
              className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-2xl z-40 bg-gradient-to-br from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 transition-all hover:scale-110"
              title="Open AI Assistant"
            >
              <Sparkles className="h-6 w-6" />
            </Button>
          )}
        </>
      )}
    </div>
  );
}
