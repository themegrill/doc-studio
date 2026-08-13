"use client";

import {
  createContext,
  useContext,
  useState,
  ReactNode,
  useMemo,
  useEffect,
  useRef,
  useCallback,
} from "react";

/**
 * Global editing state context for documents and sections.
 *
 * This context manages:
 * - Edit mode state (isEditing)
 * - Save/Cancel handlers registered by individual pages
 * - Save operation status (saving, success, error)
 *
 * The Edit/Save/Cancel buttons in the top navigation bar use this context
 * to control editing across all document and section pages.
 */
interface EditingContextType {
  // Edit mode state
  isEditing: boolean;
  setIsEditing: (value: boolean) => void;

  // Whether there are unsaved changes
  isDirty: boolean;
  setIsDirty: (value: boolean) => void;

  // Handler functions (registered by DocRenderer or SectionPage)
  onSave: () => Promise<void>;
  setOnSave: (fn: (() => Promise<void>) | null) => void;
  onSaveDraft: () => Promise<void>;
  setOnSaveDraft: (fn: (() => Promise<void>) | null) => void;
  onCancel: () => void;
  setOnCancel: (fn: (() => void) | null) => void;

  // Whether the current page supports draft saving (docs do, sections don't)
  draftEnabled: boolean;
  setDraftEnabled: (value: boolean) => void;

  // Whether the current document is already published
  isPublished: boolean;
  setIsPublished: (value: boolean) => void;

  // Outstanding editorial guideline warnings for the document being edited
  // (DOCSTUDIO-45). Advisory only — these never block a save or publish.
  guidelineWarnings: string[];
  setGuidelineWarnings: (value: string[]) => void;

  // Save operation status
  isSaving: boolean;
  setIsSaving: (value: boolean) => void;
  saveSuccess: boolean;
  setSaveSuccess: (value: boolean) => void;
  saveError: string;
  setSaveError: (value: string) => void;
}

const EditingContext = createContext<EditingContextType | undefined>(undefined);

export function EditingProvider({ children }: { children: ReactNode }) {
  // Edit mode and save operation state
  const [isEditing, setIsEditing] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [draftEnabled, setDraftEnabled] = useState(false);
  const [isPublished, setIsPublished] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [guidelineWarnings, setGuidelineWarningsState] = useState<string[]>([]);

  // Skip the state update when the warning list is unchanged. DocRenderer
  // recomputes findings on every keystroke, and a new array reference each time
  // would re-render the whole nav bar for no visible change.
  const setGuidelineWarnings = useCallback((next: string[]) => {
    setGuidelineWarningsState((prev) =>
      prev.length === next.length && prev.every((m, i) => m === next[i])
        ? prev
        : next,
    );
  }, []);

  /**
   * Handler Pattern Explanation:
   *
   * We use refs + useCallback to store handlers instead of direct state because:
   *
   * 1. Storing functions in state causes issues:
   *    - React treats function as updater: setState(fn) calls fn(currentState)
   *    - This leads to infinite loops and unexpected behavior
   *
   * 2. Using refs allows:
   *    - DocRenderer/SectionPage to register their save/cancel logic
   *    - Top navigation EditControls to call these handlers
   *    - No re-renders when handlers are updated
   *    - Always access the latest handler version
   *
   * 3. useCallback wrappers provide:
   *    - Stable function references (don't change between renders)
   *    - Simple call interface: just call onSave() or onCancel()
   */

  // Store handler references (updated by pages via setOnSave/setOnCancel)
  const onSaveRef = useRef<(() => Promise<void>) | null>(null);
  const onSaveDraftRef = useRef<(() => Promise<void>) | null>(null);
  const onCancelRef = useRef<(() => void) | null>(null);

  // Stable setters - pages use these to register their handlers
  const setOnSave = useCallback((fn: (() => Promise<void>) | null) => {
    onSaveRef.current = fn;
  }, []);

  const setOnSaveDraft = useCallback((fn: (() => Promise<void>) | null) => {
    onSaveDraftRef.current = fn;
  }, []);

  const setOnCancel = useCallback((fn: (() => void) | null) => {
    onCancelRef.current = fn;
  }, []);

  // Stable wrapper functions - EditControls calls these
  // These always invoke the latest registered handler from the ref
  const onSave = useCallback(async () => {
    if (onSaveRef.current) {
      await onSaveRef.current();
    }
  }, []);

  const onSaveDraft = useCallback(async () => {
    if (onSaveDraftRef.current) {
      await onSaveDraftRef.current();
    }
  }, []);

  const onCancel = useCallback(() => {
    if (onCancelRef.current) {
      onCancelRef.current();
    }
  }, []);

  /**
   * Memoize context value for performance.
   *
   * Only depends on state values (isEditing, isSaving, saveSuccess, saveError).
   * The callback functions (onSave, onCancel, setOnSave, setOnCancel, etc.)
   * are stable and don't need to be in dependencies.
   *
   * This ensures the context only triggers re-renders when actual state changes,
   * not when handler functions are registered/updated.
   */
  const value = useMemo(
    () => ({
      isEditing,
      setIsEditing,
      isDirty,
      setIsDirty,
      draftEnabled,
      setDraftEnabled,
      isPublished,
      setIsPublished,
      onSave,
      onSaveDraft,
      onCancel,
      setOnSave,
      setOnSaveDraft,
      setOnCancel,
      isSaving,
      setIsSaving,
      saveSuccess,
      setSaveSuccess,
      saveError,
      setSaveError,
      guidelineWarnings,
      setGuidelineWarnings,
    }),
    [isEditing, isDirty, draftEnabled, isPublished, isSaving, saveSuccess, saveError,
     guidelineWarnings, setGuidelineWarnings],
  );

  return (
    <EditingContext.Provider value={value}>
      <UnsavedChangesGuard active={isEditing && isDirty} />
      {children}
    </EditingContext.Provider>
  );
}

/**
 * Warns before unsaved edits are abandoned (DOCSTUDIO-41).
 *
 * The guard used to be opt-in per link — a `window.confirm` wired into the two
 * sidebar components — so every other route out of the page silently discarded
 * the writer's work: the site logo, the Settings button, quick search results,
 * the changelog and website links, closing the tab. The reported symptom was
 * the logo; the cause was that protection had to be remembered for each new
 * link.
 *
 * Listening once at the document level inverts that: navigation is guarded by
 * default and future links inherit it.
 */
function UnsavedChangesGuard({ active }: { active: boolean }) {
  useEffect(() => {
    if (!active) return;

    // Covers reloads, tab close and anything that leaves the app entirely.
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    // Covers in-app navigation, which beforeunload never sees because the
    // App Router changes route without unloading the document.
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      // Modified clicks open a new tab, so the current work is not at risk.
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as HTMLElement | null)?.closest?.("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      if (anchor.target && anchor.target !== "_self") return;

      // Links inside the document body are handled by the editor itself —
      // clicking one while editing places the cursor rather than navigating.
      if (anchor.closest(".bn-editor")) return;

      const confirmed = window.confirm(
        "You have unsaved changes. Leave without saving?",
      );
      if (!confirmed) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    // Capture phase, so the decision is made before a router link handles it.
    document.addEventListener("click", onClick, true);

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [active]);

  return null;
}

/**
 * Hook to access editing context.
 *
 * Usage examples:
 *
 * 1. In EditControls (top nav):
 *    const { isEditing, setIsEditing, onSave, onCancel } = useEditing();
 *    <Button onClick={() => setIsEditing(true)}>Edit</Button>
 *    <Button onClick={onSave}>Save</Button>
 *
 * 2. In DocRenderer/SectionPage (register handlers):
 *    const { setOnSave, setOnCancel } = useEditing();
 *    useEffect(() => {
 *      setOnSave(handleSave);
 *      setOnCancel(handleCancel);
 *      return () => { setOnSave(null); setOnCancel(null); };
 *    }, [handleSave, handleCancel]);
 */
export function useEditing() {
  const context = useContext(EditingContext);
  if (context === undefined) {
    throw new Error("useEditing must be used within an EditingProvider");
  }
  return context;
}
