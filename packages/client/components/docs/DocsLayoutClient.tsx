"use client";

import { Navigation } from "@/lib/db/ContentManager";
import Sidebar from "@/components/docs/Sidebar";
import TableOfContents from "@/components/docs/TableOfContents";
import SearchDialog from "@/components/docs/SearchDialog";
import Image from "next/image";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useState, useEffect } from "react";

interface DocsLayoutClientProps {
  children: React.ReactNode;
  navigation: Navigation;
  logo?: string;
}

const FALLBACK_LOGO = "https://themegrill.com/wp-content/uploads/2021/08/tg-logo-black.png";

export default function DocsLayoutClient({ children, navigation, logo }: DocsLayoutClientProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) setIsSidebarOpen(false);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="flex flex-col h-screen">
      {/* Top bar */}
      <div className="border-b bg-white px-4 md:px-8 py-3 flex-shrink-0">
        <div className="grid grid-cols-3 items-center gap-4">
          {/* Left: hamburger + logo + version */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="lg:hidden p-2 hover:bg-gray-100 rounded-md transition-colors"
              aria-label="Toggle menu"
            >
              <Menu size={20} />
            </button>
            <Link href="/docs">
              <Image
                src={logo ?? FALLBACK_LOGO}
                alt="Logo"
                width={150}
                height={40}
                className="object-contain max-h-10"
              />
            </Link>
            <span className="hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              v{navigation.version}
            </span>
          </div>

          {/* Center: search */}
          <div className="flex justify-center">
            <div className="w-full max-w-md">
              <SearchDialog projectSlug={null} />
            </div>
          </div>

          {/* Right: empty — no auth/edit controls */}
          <div />
        </div>
      </div>

      {/* Content area */}
      <div className="flex flex-1 min-h-0 relative">
        {/* Mobile overlay */}
        {isSidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Left sidebar */}
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
          <Sidebar navigation={navigation} />
        </div>

        <main className="flex-1 p-4 md:p-8 bg-white overflow-y-auto">
          {children}
        </main>

        <TableOfContents />
      </div>
    </div>
  );
}
