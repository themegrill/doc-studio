"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Navigation, NavRoute } from "@/lib/db/ContentManager";
import { ChevronRight, Book } from "lucide-react";
import { useState, useMemo, memo } from "react";
import { parseTitleWithBadges } from "@/lib/parse-title-badges";
import { Badge } from "@/components/ui/badge-pro";

interface SidebarProps {
  navigation: Navigation;
  projectMetadata?: Record<string, any>;
}

/** Renders a title with any encoded badges (e.g. the "Pro" tag) instead of raw HTML. */
const TitleWithBadges = memo(function TitleWithBadges({
  title,
  className,
}: {
  title: string;
  className?: string;
}) {
  const { cleanTitle, badges } = useMemo(() => parseTitleWithBadges(title), [title]);
  return (
    <span className={`inline-flex items-center min-w-0 ${className ?? ""}`}>
      <span className="truncate">{cleanTitle}</span>
      {badges.map((badge, i) => (
        <Badge key={i} variant={badge.variant} className="ml-1.5 text-[10px] px-1.5 py-0 shrink-0">
          {badge.text}
        </Badge>
      ))}
    </span>
  );
});

export default function Sidebar({ navigation, projectMetadata = {} }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="w-96 border-r border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 px-4 py-6 overflow-y-auto h-full flex flex-col">
      <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-200 dark:border-gray-800">
        <Book size={18} className="text-gray-600 dark:text-gray-400" />
        <h4 className="text-md font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wider">
          Documentation
        </h4>
      </div>
      <nav className="space-y-1 flex-1">
        {navigation?.routes?.map((route) => (
          <NavItem key={route.path ?? route.title} route={route} pathname={pathname} depth={0} />
        ))}
      </nav>

      {/* Mobile Navigation Links */}
      {(projectMetadata?.websiteLink || projectMetadata?.pricingLink || projectMetadata?.changelogLink) && (
        <div className="mt-auto pt-6 border-t border-gray-200 dark:border-gray-800 space-y-2 lg:hidden">
          <h5 className="px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Links
          </h5>
          <div className="space-y-1">
            {projectMetadata.changelogLink && (
              <a
                href={projectMetadata.changelogLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                Changelog
              </a>
            )}
            {projectMetadata.websiteLink && (
              <a
                href={projectMetadata.websiteLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                Website
              </a>
            )}
            {projectMetadata.pricingLink && (
              <a
                href={projectMetadata.pricingLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                Pricing
              </a>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}

/** Returns true if the route or any of its descendants matches the current pathname. */
function containsActive(route: NavRoute, pathname: string): boolean {
  const link = route.path?.replace(/^\/docs/, "");
  if (link && pathname === link) return true;
  return route.children?.some((c) => containsActive(c, pathname)) ?? false;
}

const NavItem = memo(function NavItem({
  route,
  pathname,
  depth,
}: {
  route: NavRoute;
  pathname: string;
  depth: number;
}) {
  const hasChildren = !!route.children?.length;

  // Auto-expand if this section contains the active page; collapsed otherwise
  const [isOpen, setIsOpen] = useState(() => containsActive(route, pathname));

  const buildLink = (path: string) => path.replace(/^\/docs/, "");

  const parentLink = useMemo(
    () => (route.path ? buildLink(route.path) : null),
    [route.path]
  );
  const isActive = parentLink ? pathname === parentLink : false;

  if (hasChildren) {
    return (
      <div>
        <button
          onClick={() => setIsOpen((o) => !o)}
          className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors text-left ${
            isActive
              ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300"
              : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
          }`}
        >
          <TitleWithBadges title={route.title} className="flex-1" />
          <ChevronRight
            size={15}
            className={`shrink-0 text-gray-400 dark:text-gray-500 transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}
          />
        </button>

        {isOpen && (
          <div className={`mt-0.5 space-y-0.5 ${depth === 0 ? "ml-3 pl-3 border-l border-gray-200 dark:border-gray-800" : "ml-3"}`}>
            {route.children?.map((child) => (
              <NavItem
                key={child.path ?? child.title}
                route={child}
                pathname={pathname}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const link = route.path ? buildLink(route.path) : "#";
  const isLeafActive = pathname === link;

  return (
    <Link
      href={link}
      className={`flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors ${
        isLeafActive
          ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-medium"
          : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:text-gray-200"
      }`}
    >
      {isLeafActive && (
        <span className="w-1 h-1 rounded-full bg-blue-600 shrink-0" />
      )}
      <TitleWithBadges title={route.title} className={isLeafActive ? "" : "pl-3"} />
    </Link>
  );
});
