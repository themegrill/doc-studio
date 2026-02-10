"use client";

import {
  createContext,
  useContext,
  useState,
  ReactNode,
  useMemo,
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

  // Handler functions (registered by DocRenderer or SectionPage)
  onSave: () => Promise<void>;
  setOnSave: (fn: (() => Promise<void>) | null) => void;
  onCancel: () => void;
  setOnCancel: (fn: (() => void) | null) => void;

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
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState("");

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
  const onCancelRef = useRef<(() => void) | null>(null);

  // Stable setters - pages use these to register their handlers
  const setOnSave = useCallback((fn: (() => Promise<void>) | null) => {
    onSaveRef.current = fn;
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
      onSave,
      onCancel,
      setOnSave,
      setOnCancel,
      isSaving,
      setIsSaving,
      saveSuccess,
      setSaveSuccess,
      saveError,
      setSaveError,
    }),
    [isEditing, isSaving, saveSuccess, saveError],
  );

  return (
    <EditingContext.Provider value={value}>{children}</EditingContext.Provider>
  );
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
