"use client";

import { Navigation } from "@/lib/db/ContentManager";
import SidebarWithDnd from "@/components/docs/SidebarWithDnd";
import UserMenu from "@/components/auth/UserMenu";
import TableOfContents from "@/components/docs/TableOfContents";
import SearchDialog from "@/components/docs/SearchDialog";
import Image from "next/image";
import { Menu, X, Pencil, Save, Loader2, CheckCircle, AlertCircle, Eye } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { EditingProvider, useEditing } from "@/contexts/EditingContext";
import { Button } from "@/components/ui/button";

interface DocsLayoutClientProps {
  children: React.ReactNode;
  navigation: Navigation;
}

function EditControls() {
  const {
    isEditing,
    setIsEditing,
    onSave,
    onCancel,
    isSaving,
    saveSuccess,
    saveError,
  } = useEditing();
  const pathname = usePathname();

  // Only show controls on document/section pages (not on home/list pages)
  const isDocumentPage = pathname.includes('/docs/') || pathname.includes('/projects/');
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
    <div className="flex items-center gap-2">
      {saveSuccess && (
        <div className="flex items-center gap-1 text-green-600 text-sm">
          <CheckCircle size={16} />
          <span className="hidden sm:inline">Saved!</span>
        </div>
      )}
      {saveError && (
        <div className="flex items-center gap-1 text-red-600 text-sm max-w-[150px] truncate">
          <AlertCircle size={16} />
          <span className="hidden sm:inline truncate">{saveError}</span>
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
      <Button
        onClick={onSave}
        disabled={isSaving}
        size="sm"
        className="flex items-center gap-2"
      >
        {isSaving ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            <span className="hidden sm:inline">Saving...</span>
          </>
        ) : (
          <>
            <Save size={16} />
            <span className="hidden sm:inline">Save & Publish</span>
          </>
        )}
      </Button>
    </div>
  );
}

function DocsLayoutContent({
  children,
  navigation,
}: DocsLayoutClientProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { data: session } = useSession();
  const pathname = usePathname();

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
      <div className="border-b bg-white px-4 md:px-8 py-3 flex-shrink-0">
        <div className="grid grid-cols-3 items-center gap-4">
          {/* Left: Logo and Version */}
          <div className="flex items-center gap-4">
            {/* Hamburger Menu - Mobile/Tablet */}
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="lg:hidden p-2 hover:bg-gray-100 rounded-md transition-colors"
              aria-label="Toggle menu"
            >
              <Menu size={20} />
            </button>

            <Image
              src="https://themegrill.com/wp-content/uploads/2021/08/tg-logo-black.png"
              alt="Logo"
              width={150}
              height={20}
            />
            <span className="hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              v{navigation.version}
            </span>
          </div>

          {/* Center: Search */}
          <div className="flex justify-center">
            <div className="w-full max-w-md">
              <SearchDialog projectSlug={projectSlug} />
            </div>
          </div>

          {/* Right: Edit Controls & User Menu */}
          <div className="flex justify-end items-center gap-2">
            {session?.user && <EditControls />}
            <UserMenu />
          </div>
        </div>
      </div>

      {/* Content area with sidebars */}
      <div className="flex flex-1 min-h-0 relative">
        {/* Mobile Overlay */}
        {isSidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
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
          <div className="h-full lg:hidden absolute top-4 right-4">
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="p-2 hover:bg-gray-200 rounded-md transition-colors"
              aria-label="Close menu"
            >
              <X size={20} />
            </button>
          </div>
          <SidebarWithDnd
            navigation={navigation}
            isAuthenticated={!!session?.user}
            projectSlug={projectSlug}
          />
        </div>

        <main className="flex-1 p-4 md:p-8 bg-white overflow-y-auto">
          {children}
        </main>
        <TableOfContents />
      </div>
    </div>
  );
}

export default function DocsLayoutClient(props: DocsLayoutClientProps) {
  return (
    <EditingProvider>
      <DocsLayoutContent {...props} />
    </EditingProvider>
  );
}
