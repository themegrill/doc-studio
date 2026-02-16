"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles } from "lucide-react";
import { useSession } from "next-auth/react";
import DeleteSectionButton from "@/components/docs/DeleteSectionButton";
import ChatPanel from "@/components/chat/ChatPanel";
import { useEditing } from "@/contexts/EditingContext";

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
  const editingContext = useEditing();
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(sectionTitle);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Use ref to store latest title without causing re-renders
  const titleRef = useRef(title);

  useEffect(() => {
    titleRef.current = title;
  }, [title]);

  // Sync editing state with context
  useEffect(() => {
    if (editingContext.isEditing !== isEditing) {
      setIsEditing(editingContext.isEditing);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingContext.isEditing]);

  // Initialize chat state - always start with false to match SSR
  const [chatOpen, setChatOpen] = useState(false);

  // Load chat state from localStorage after hydration
  useEffect(() => {
    const saved = localStorage.getItem('chatOpen');
    if (saved === 'true') {
      setChatOpen(true);
    }
  }, []);

  // Save chat state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('chatOpen', String(chatOpen));
  }, [chatOpen]);

  // Document context for AI chat
  const documentContext = {
    title: sectionTitle,
    description: `Section page for ${sectionTitle}`,
    projectSlug: projectSlug || null,
    blocksPreview: "",
  };

  const handleSave = useCallback(async () => {
    const currentTitle = titleRef.current;

    if (!currentTitle.trim()) {
      const errorMsg = "Title is required";
      setError(errorMsg);
      editingContext.setSaveError(errorMsg);
      return;
    }

    setError("");
    setLoading(true);
    editingContext.setIsSaving(true);
    editingContext.setSaveError("");
    editingContext.setSaveSuccess(false);

    try {
      const response = await fetch(
        `/api/projects/${projectSlug}/sections/${sectionSlug}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: currentTitle }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to update section");
      }

      setIsEditing(false);
      editingContext.setIsEditing(false);
      editingContext.setIsSaving(false);
      editingContext.setSaveSuccess(true);
      router.refresh();

      setTimeout(() => {
        editingContext.setSaveSuccess(false);
      }, 3000);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to update section";
      setError(errorMsg);
      editingContext.setSaveError(errorMsg);
      editingContext.setIsSaving(false);
    } finally {
      setLoading(false);
    }
  }, [projectSlug, sectionSlug, editingContext, router]);

  const handleCancel = useCallback(() => {
    setTitle(sectionTitle);
    setError("");
    setIsEditing(false);
    editingContext.setIsEditing(false);
    editingContext.setSaveError("");
  }, [sectionTitle, editingContext]);

  // Register save and cancel handlers - update when they change
  useEffect(() => {
    editingContext.setOnSave(handleSave);
    editingContext.setOnCancel(handleCancel);

    return () => {
      editingContext.setOnSave(null);
      editingContext.setOnCancel(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleSave, handleCancel]);

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
          <DeleteSectionButton
            projectSlug={projectSlug}
            sectionSlug={sectionSlug}
            sectionTitle={sectionTitle}
          />
        )}
      </div>

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
