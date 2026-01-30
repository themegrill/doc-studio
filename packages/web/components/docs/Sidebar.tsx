"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Navigation, NavRoute } from "@/lib/db/ContentManager";
import { ChevronRight, ChevronDown, FileText, Book } from "lucide-react";
import { useState } from "react";
import AddSectionButton from "@/components/docs/AddSectionButton";
import AddDocumentButton from "@/components/docs/AddDocumentButton";

interface SidebarProps {
  navigation: Navigation;
  isAuthenticated?: boolean;
  projectSlug?: string | null;
}

export default function Sidebar({ navigation, isAuthenticated, projectSlug }: SidebarProps) {
  return (
    <aside className="w-64 border-r bg-gray-50 p-6 overflow-y-auto h-full flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <Book size={16} className="text-gray-600" />
        <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">
          Documentation
        </h4>
      </div>

      <nav className="space-y-1 flex-1">
        {navigation.routes.map((route) => (
          <NavItem
            key={route.path}
            route={route}
            isAuthenticated={isAuthenticated}
            projectSlug={projectSlug}
          />
        ))}
      </nav>

      {isAuthenticated && projectSlug && (
        <div className="mt-4 pt-4 border-t">
          <AddSectionButton projectSlug={projectSlug} />
        </div>
      )}
    </aside>
  );
}

function NavItem({
  route,
  isAuthenticated,
  projectSlug: propProjectSlug
}: {
  route: NavRoute;
  isAuthenticated?: boolean;
  projectSlug?: string | null;
}) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(true);
  const hasChildren = route.children && route.children.length > 0;

  // Detect if we're in a project context
  const projectMatch = pathname.match(/^\/projects\/([^\/]+)/);
  const projectSlug = propProjectSlug || (projectMatch ? projectMatch[1] : null);

  // Build the correct link based on context
  const buildLink = (path: string) => {
    // Remove leading /docs/ from the path if it exists
    const cleanPath = path.replace(/^\/docs\//, "");

    if (projectSlug) {
      // Project-based URL: /projects/{slug}/docs/{path}
      return `/projects/${projectSlug}/docs/${cleanPath}`;
    } else {
      // Domain-based URL: /docs/{path}
      return `/docs/${cleanPath}`;
    }
  };

  const parentLink = buildLink(route.path);
  const isParentActive = pathname === parentLink;

  // Extract section slug from route path for AddDocumentButton
  const sectionSlug = route.path.replace(/^\/docs\//, "");

  // Show as expandable if has children OR if authenticated (so they can add documents)
  const isExpandable = hasChildren || (isAuthenticated && projectSlug);

  return (
    <div>
      {isExpandable ? (
        <>
          <div className="flex items-center gap-1">
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
          </div>
          {isOpen && (
            <div className="ml-4 mt-1 space-y-1">
              {hasChildren && route.children?.map((child) => {
                const childLink = buildLink(child.path);
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
              {isAuthenticated && projectSlug && (
                <div className={hasChildren ? "pt-1" : ""}>
                  <AddDocumentButton
                    projectSlug={projectSlug}
                    sectionSlug={sectionSlug}
                    sectionTitle={route.title}
                  />
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <Link
          href={buildLink(route.path)}
          className={`flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors ${
            pathname === buildLink(route.path)
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
}
