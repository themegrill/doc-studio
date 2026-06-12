"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Navigation, NavRoute } from "@/lib/db/ContentManager";
import { ChevronRight, Book } from "lucide-react";
import { useState, useMemo, memo } from "react";

interface SidebarProps {
  navigation: Navigation;
}

export default function Sidebar({ navigation }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="w-96 border-r bg-gray-50 px-4 py-6 overflow-y-auto h-full flex flex-col">
      <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-200">
        <Book size={18} className="text-gray-600" />
        <h4 className="text-md font-semibold text-gray-900 uppercase tracking-wider">
          Documentation
        </h4>
      </div>
      <nav className="space-y-1 flex-1">
        {navigation?.routes?.map((route) => (
          <NavItem key={route.path ?? route.title} route={route} pathname={pathname} depth={0} />
        ))}
      </nav>
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
              ? "bg-blue-50 text-blue-700"
              : "text-gray-700 hover:bg-gray-100"
          }`}
        >
          <span className="flex-1 truncate">{route.title}</span>
          <ChevronRight
            size={15}
            className={`shrink-0 text-gray-400 transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}
          />
        </button>

        {isOpen && (
          <div className={`mt-0.5 space-y-0.5 ${depth === 0 ? "ml-3 pl-3 border-l border-gray-200" : "ml-3"}`}>
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
          ? "bg-blue-50 text-blue-700 font-medium"
          : "text-gray-600 hover:bg-gray-100"
      }`}
    >
      {isLeafActive && (
        <span className="w-1 h-1 rounded-full bg-blue-600 shrink-0" />
      )}
      <span className={isLeafActive ? "" : "pl-3"}>{route.title}</span>
    </Link>
  );
});
