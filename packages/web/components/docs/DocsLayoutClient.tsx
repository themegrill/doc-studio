"use client";

import { Navigation } from "@/lib/db/ContentManager";
import Sidebar from "@/components/docs/Sidebar";
import UserMenu from "@/components/auth/UserMenu";
import TableOfContents from "@/components/docs/TableOfContents";
import Image from "next/image";
import { Menu, X } from "lucide-react";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";

interface DocsLayoutClientProps {
  children: React.ReactNode;
  navigation: Navigation;
}

export default function DocsLayoutClient({
  children,
  navigation,
}: DocsLayoutClientProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { data: session } = useSession();
  const pathname = usePathname();

  // Extract project slug from pathname if in project context
  const projectMatch = pathname.match(/^\/projects\/([^\/]+)/);
  const projectSlug = projectMatch ? projectMatch[1] : null;

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
      <div className="border-b bg-white px-4 md:px-8 py-3 flex justify-between items-center flex-shrink-0">
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
          <span className="text-xs text-gray-500 hidden sm:inline">
            Version {navigation.version}
          </span>
        </div>
        <UserMenu />
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
          <Sidebar
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
