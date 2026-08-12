"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Navigation, NavRoute } from "@/lib/db/ContentManager";
import { ChevronRight, ChevronDown, FileText, Book, Plus } from "lucide-react";
import { useState, useMemo, useCallback, memo } from "react";
import AddSectionButton from "@/components/docs/AddSectionButton";
import AddDocumentButton from "@/components/docs/AddDocumentButton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SidebarProps {
  navigation: Navigation;
  isAuthenticated?: boolean;
  projectSlug?: string | null;
}

export default function Sidebar({ navigation, isAuthenticated, projectSlug }: SidebarProps) {
  // Call usePathname once at the parent level instead of in each NavItem
  const pathname = usePathname();


  return (
    <TooltipProvider delayDuration={200}>
      <aside className="w-72 border-r bg-gray-50 p-6 overflow-y-auto h-full flex flex-col">
        <div className="flex items-center gap-2 mb-4">
          <Book size={16} className="text-gray-600" />
          <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">
            Documentation
          </h4>
        </div>

      <nav className="space-y-1 flex-1">
        {navigation?.routes?.map((route) => (
          <NavItem
            key={route.path}
            route={route}
            pathname={pathname}
            isAuthenticated={isAuthenticated}
            projectSlug={projectSlug}
          />
        )) || null}

        {/* Add Section button - below all navigation items */}
        {isAuthenticated && projectSlug && (
          <div className="mt-4 pt-4">
            <AddSectionButton projectSlug={projectSlug} />
          </div>
        )}
      </nav>
      </aside>
    </TooltipProvider>
  );
}

// Memoized NavItem component to prevent unnecessary re-renders
const NavItem = memo(function NavItem({
  route,
  pathname,
  isAuthenticated,
  projectSlug: propProjectSlug,
}: {
  route: NavRoute;
  pathname: string;
  isAuthenticated?: boolean;
  projectSlug?: string | null;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const hasChildren = route.children && route.children.length > 0;

  // Memoize project slug extraction to avoid regex on every render
  const projectSlug = useMemo(() => {
    if (propProjectSlug) return propProjectSlug;
    const match = pathname.match(/^\/projects\/([^\/]+)/);
    return match ? match[1] : null;
  }, [pathname, propProjectSlug]);

  // Memoize buildLink function to avoid recreation on every render
  const buildLink = useCallback((path: string) => {
    // Remove leading /docs/ from the path if it exists
    const cleanPath = path.replace(/^\/docs\//, "");

    if (projectSlug) {
      // Project-based URL: /projects/{slug}/docs/{path}
      return `/projects/${projectSlug}/docs/${cleanPath}`;
    } else {
      // Domain-based URL: /docs/{path}
      return `/docs/${cleanPath}`;
    }
  }, [projectSlug]);

const parentLink = useMemo(
  () => (route.path ? buildLink(route.path) : "#"),
  [buildLink, route.path]
);
const isParentActive = route.path ? pathname === parentLink : false;

  // Extract section slug from route path for AddDocumentButton
const sectionSlug = useMemo(
  () => route.path?.replace(/^\/docs\//, "") ?? "",
  [route.path]
);
  // Show as expandable if has children OR if authenticated (so they can add documents)
  const isExpandable = hasChildren || (isAuthenticated && projectSlug);

  return (
    <div>
      {isExpandable ? (
        <>
          <div
            className="flex items-center gap-1 group"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            <Link
              href={parentLink}
                className={`flex-1 flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                isParentActive
                  ? "bg-blue-100 text-blue-700"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              <FileText size={14} />
              {route.title}
            </Link>

            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(!isOpen);
              }}
              className="p-2 hover:bg-gray-100 rounded-md transition-colors"
              aria-label={isOpen ? "Collapse" : "Expand"}
            >
              {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>

            {/* Add Document button - always rendered but invisible when not hovered (prevents layout shift) */}
            {isAuthenticated && projectSlug && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowAddDialog(true);
                    }}
                    className={`p-2 hover:bg-blue-100 hover:text-blue-700 rounded-md transition-all ${
                      isHovered ? "opacity-100" : "opacity-0 pointer-events-none"
                    }`}
                  >
                    <Plus size={14} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Add document</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          {isOpen && hasChildren && (
            <div className="ml-4 mt-1 space-y-1">
              {route.children?.map((child) => {
               	const childLink = child.path ? buildLink(child.path) : "#";
                return (
                  <Link
                    key={child.path}
                    href={childLink}
                            className={`flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors ${
                      pathname === childLink
                        ? "bg-blue-100 text-blue-700 font-medium"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    <FileText size={14} />
                    {child.title}
                  </Link>
                );
              })}
            </div>
          )}

          {/* Add Document Dialog - controlled by hover "+" button */}
          {isAuthenticated && projectSlug && (
            <AddDocumentButton
              projectSlug={projectSlug}
              sectionSlug={sectionSlug}
              sectionTitle={route.title}
              open={showAddDialog}
              onOpenChange={setShowAddDialog}
              hideTrigger
            />
          )}
        </>
      ) : (
        <Link
			href={route.path ? buildLink(route.path) : "#"}
			className={`flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors ${
				route.path && pathname === buildLink(route.path)
				? "bg-blue-100 text-blue-700 font-medium"
				: "text-gray-600 hover:bg-gray-100"
			}`}
			>
          <FileText size={14} />
          {route.title}
        </Link>
      )}
    </div>
  );
});
