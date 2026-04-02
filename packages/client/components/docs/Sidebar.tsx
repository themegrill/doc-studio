"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Navigation, NavRoute } from "@/lib/db/ContentManager";
import { ChevronRight, ChevronDown, Book } from "lucide-react";
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
          <NavItem key={route.path ?? route.title} route={route} pathname={pathname} />
        ))}
      </nav>
    </aside>
  );
}

const NavItem = memo(function NavItem({
  route,
  pathname,
}: {
  route: NavRoute;
  pathname: string;
}) {
  const hasChildren = !!route.children?.length;
  const [isOpen, setIsOpen] = useState(true);

  const buildLink = (path: string) => path.replace(/^\/docs/, "");

  const parentLink = useMemo(
    () => (route.path ? buildLink(route.path) : "#"),
    [route.path]
  );
  const isParentActive = route.path ? pathname === parentLink : false;

  if (hasChildren) {
    return (
      <div>
        <div className="flex items-center gap-1">
          <Link
            href={parentLink}
            className={`flex-1 flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
              isParentActive ? "bg-blue-100 text-blue-700" : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            {route.title}
          </Link>
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="p-2 hover:bg-gray-100 rounded-md transition-colors"
            aria-label={isOpen ? "Collapse" : "Expand"}
          >
            {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        </div>
        {isOpen && (
          <div className="ml-4 mt-1 space-y-1">
            {route.children?.map((child) => {
              const childLink = child.path ? buildLink(child.path) : "#";
              return (
                <Link
                  key={child.path ?? child.title}
                  href={childLink}
                  className={`flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors ${
                    pathname === childLink
                      ? "bg-blue-100 text-blue-700 font-medium"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {child.title}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <Link
      href={route.path ? buildLink(route.path) : "#"}
      className={`flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors ${
        route.path && pathname === buildLink(route.path)
          ? "bg-blue-100 text-blue-700 font-medium"
          : "text-gray-600 hover:bg-gray-100"
      }`}
    >
      {route.title}
    </Link>
  );
});
