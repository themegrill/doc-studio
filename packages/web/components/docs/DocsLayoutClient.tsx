"use client";

import { Navigation } from "@/lib/db/ContentManager";
import dynamic from "next/dynamic";
import UserMenu from "@/components/auth/UserMenu";
import TableOfContents from "@/components/docs/TableOfContents";
import SearchDialog from "@/components/docs/SearchDialog";
import Image from "next/image";
import Link from "next/link";
import { Menu, X, Pencil, Save, Loader2, CheckCircle, AlertCircle, Eye, Settings, FileEdit, AlertTriangle } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { EditingProvider, useEditing } from "@/contexts/EditingContext";
import { Button } from "@/components/ui/button";

// Dynamically import SidebarWithDnd with ssr: false to prevent hydration mismatch
// caused by @dnd-kit generating different IDs on server and client
const SidebarWithDnd = dynamic(
  () => import("@/components/docs/SidebarWithDnd"),
  { ssr: false }
);

interface DocsLayoutClientProps {
  children: React.ReactNode;
  navigation: Navigation;
  userProjectRole?: string | null;
  projectMetadata?: Record<string, any>;
}

function EditControls() {
  const {
    isEditing,
    setIsEditing,
    draftEnabled,
    isPublished,
    onSave,
    onSaveDraft,
    onCancel,
    isSaving,
    saveSuccess,
    saveError,
    guidelineWarnings,
  } = useEditing();
  const pathname = usePathname();

  // Outstanding guideline warnings are shown once before publishing and then
  // the publish proceeds regardless (DOCSTUDIO-45 §3.1 — warn only, never block).
  const [showWarnings, setShowWarnings] = useState(false);

  const handlePublish = () => {
    if (guidelineWarnings.length > 0 && !showWarnings) {
      setShowWarnings(true);
      return;
    }
    setShowWarnings(false);
    onSave();
  };

  // Only show controls on individual document/section pages, not on the sections index
  const isDocumentPage = pathname.includes('/docs/');
  if (!isDocumentPage) return null;

  if (!isEditing) {
    return (
      <Button
        onClick={() => setIsEditing(true)}
        variant="outline"
        size="sm"
        className="flex items-center gap-2"
      >
        <Pencil size={16} />
        Edit
      </Button>
    );
  }

  return (
    <div className="relative flex items-center gap-2">
      {showWarnings && (
        <GuidelineWarningPopover
          warnings={guidelineWarnings}
          onDismiss={() => setShowWarnings(false)}
          onPublishAnyway={() => {
            setShowWarnings(false);
            onSave();
          }}
        />
      )}
      {guidelineWarnings.length > 0 && !showWarnings && (
        <button
          type="button"
          onClick={() => setShowWarnings(true)}
          title="Guidelines not met"
          className="flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-100 transition-colors"
        >
          <AlertTriangle size={12} />
          {guidelineWarnings.length}
        </button>
      )}
      {saveSuccess && (
        <div className="flex items-center gap-1 text-sm text-green-600">
          <CheckCircle size={16} />
          <span className="hidden sm:inline">Saved!</span>
        </div>
      )}
      {saveError && (
        <div className="flex items-center gap-1 text-red-600 text-sm max-w-[150px] truncate">
          <AlertCircle size={16} />
          <span className="hidden truncate sm:inline">{saveError}</span>
        </div>
      )}
      <Button
        onClick={onCancel}
        variant="outline"
        size="sm"
        className="flex items-center gap-2"
      >
        <Eye size={16} />
        <span className="hidden sm:inline">Cancel</span>
      </Button>
      {isPublished ? (
        <Button
          onClick={handlePublish}
          disabled={isSaving}
          size="sm"
          className="flex items-center gap-2"
        >
          {isSaving ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              <span className="hidden sm:inline">Updating...</span>
            </>
          ) : (
            <>
              <Save size={16} />
              <span className="hidden sm:inline">Update</span>
            </>
          )}
        </Button>
      ) : (
        <>
          {draftEnabled && (
            <Button
              onClick={onSaveDraft}
              disabled={isSaving}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
            >
              {isSaving ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <FileEdit size={16} />
              )}
              <span className="hidden sm:inline">Save Draft</span>
            </Button>
          )}
          <Button
            onClick={handlePublish}
            disabled={isSaving}
            size="sm"
            className="flex items-center gap-2"
          >
            {isSaving ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span className="hidden sm:inline">Publishing...</span>
              </>
            ) : (
              <>
                <Save size={16} />
                <span className="hidden sm:inline">Publish</span>
              </>
            )}
          </Button>
        </>
      )}
    </div>
  );
}

/**
 * The pre-publish checklist (DOCSTUDIO-45 §4).
 *
 * Shown once when Publish is pressed with outstanding warnings. Publishing is
 * never blocked — the second press goes through — so this is information, not a
 * gate. Save Draft never triggers it at all.
 */
function GuidelineWarningPopover({
  warnings,
  onDismiss,
  onPublishAnyway,
}: {
  warnings: string[];
  onDismiss: () => void;
  onPublishAnyway: () => void;
}) {
  return (
    <div className="absolute right-0 top-full mt-2 z-50 w-80 rounded-lg border border-amber-200 bg-white shadow-lg">
      <div className="flex items-start gap-2 border-b border-gray-100 px-4 py-3">
        <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-600" />
        <div>
          <p className="text-sm font-medium text-gray-900">
            {warnings.length} guideline{warnings.length === 1 ? "" : "s"} not met
          </p>
          <p className="text-xs text-gray-500">
            You can publish anyway — this is a reminder, not a block.
          </p>
        </div>
      </div>
      <ul className="max-h-56 space-y-1.5 overflow-y-auto px-4 py-3">
        {warnings.map((warning, index) => (
          <li key={index} className="text-xs leading-relaxed text-gray-600">
            {warning}
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-4 py-2.5">
        <Button variant="outline" size="sm" onClick={onDismiss}>
          Review first
        </Button>
        <Button size="sm" onClick={onPublishAnyway}>
          Publish anyway
        </Button>
      </div>
    </div>
  );
}

function DocsLayoutContent({
  children,
  navigation,
  userProjectRole,
  projectMetadata = {},
}: DocsLayoutClientProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { data: session } = useSession();
  const pathname = usePathname();
  const { isEditing, isDirty } = useEditing();

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isEditing && isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isEditing, isDirty]);

  // Extract project slug from pathname if in project context
  // Memoized to avoid regex computation on every render
  const projectSlug = useMemo(() => {
    const match = pathname.match(/^\/projects\/([^\/]+)/);
    return match ? match[1] : null;
  }, [pathname]);

  // Close sidebar when screen gets larger
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setIsSidebarOpen(false);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="flex flex-col h-screen">
      {/* Top bar - Full width */}
      <div className="flex-shrink-0 px-4 py-3 bg-white border-b md:px-8 tg-docs-navbar">
        <div className="grid items-center grid-cols-3 gap-4 tg-docs-navbar-elements">
          {/* Left: Logo */}
          <div className="flex items-center gap-4">
            {/* Hamburger Menu - Mobile/Tablet */}
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 transition-colors rounded-md lg:hidden hover:bg-gray-100"
              aria-label="Toggle menu"
            >
              <Menu size={20} />
            </button>

            <Link href="/projects">
              <Image
                src={projectMetadata?.logo || "https://themegrill.com/wp-content/uploads/2021/08/tg-logo-black.png"}
                alt="Logo"
                width={150}
                height={40}
                className="object-contain max-h-10"
              />
            </Link>
          </div>

          {/* Center: Search */}
          <div className="flex justify-center">
            <div className="w-full max-w-md">
              <SearchDialog projectSlug={projectSlug} />
            </div>
          </div>

          {/* Right: Settings, Edit Controls & User Menu */}
          <div className="flex items-center justify-end gap-2">
            {/* Desktop Navigation Links */}
            {(projectMetadata?.websiteLink || projectMetadata?.pricingLink || projectMetadata?.changelogLink) && (
              <nav className="hidden lg:flex items-center gap-5 mr-4 border-r pr-4 border-gray-200">
                {projectMetadata?.changelogLink && (
                  <a
                    href={projectMetadata.changelogLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors"
                  >
                    Changelog
                  </a>
                )}
                {projectMetadata?.websiteLink && (
                  <a
                    href={projectMetadata.websiteLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors"
                  >
                    Website
                  </a>
                )}
                {projectMetadata?.pricingLink && (
                  <a
                    href={projectMetadata.pricingLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors"
                  >
                    Pricing
                  </a>
                )}
              </nav>
            )}
            {session?.user && projectSlug && (userProjectRole === "owner" || userProjectRole === "admin") && (
              <Link href={`/projects/${projectSlug}/settings`}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex items-center gap-2"
                  title="Project Settings"
                >
                  <Settings size={16} />
                  <span className="hidden md:inline">Settings</span>
                </Button>
              </Link>
            )}
            {session?.user && <EditControls />}
            <UserMenu />
          </div>
        </div>
      </div>

      {/* Content area with sidebars */}
      <div className="relative flex flex-1 min-h-0">
        {/* Mobile Overlay */}
        {isSidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Left Sidebar */}
        <div
          className={`
            fixed lg:relative inset-y-0 left-0 z-50 lg:z-0
            transform lg:transform-none transition-transform duration-300
            ${isSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
          `}
        >
          <div className="absolute h-full lg:hidden top-4 right-4">
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="p-2 transition-colors rounded-md hover:bg-gray-200"
              aria-label="Close menu"
            >
              <X size={20} />
            </button>
          </div>
          <SidebarWithDnd
            navigation={navigation}
            isAuthenticated={!!session?.user}
            projectSlug={projectSlug}
            projectMetadata={projectMetadata}
          />
        </div>

        <main className="flex-1 p-4 overflow-y-auto bg-white md:p-8">
          {children}
        </main>
        <TableOfContents />
      </div>
    </div>
  );
}

export default function DocsLayoutClient({
  children,
  navigation,
  userProjectRole,
  projectMetadata,
}: DocsLayoutClientProps) {
  return (
    <EditingProvider>
      <DocsLayoutContent
        navigation={navigation}
        userProjectRole={userProjectRole}
        projectMetadata={projectMetadata}
      >
        {children}
      </DocsLayoutContent>
    </EditingProvider>
  );
}
