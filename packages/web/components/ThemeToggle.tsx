"use client";

import { useTheme, Theme } from "@/components/providers/ThemeProvider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Sun, MoonStar, Settings } from "lucide-react";
import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch by rendering after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" className="h-9 w-9">
        <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      </Button>
    );
  }

  const getIcon = (t: Theme) => {
    switch (t) {
      case "light":
        return <Sun size={18} className="text-gray-600 dark:text-gray-300" />;
      case "dark":
        return <MoonStar size={18} className="text-gray-600 dark:text-gray-300" />;
      case "system":
        return <Settings size={18} className="text-gray-600 dark:text-gray-300" />;
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9 focus-visible:ring-0">
          {getIcon(theme)}
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[120px]">
        <DropdownMenuItem
          onClick={() => setTheme("light")}
          className={`flex items-center gap-2 cursor-pointer ${theme === "light" ? "bg-accent text-accent-foreground font-semibold" : ""}`}
        >
          <Sun size={16} />
          <span>Light</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme("dark")}
          className={`flex items-center gap-2 cursor-pointer ${theme === "dark" ? "bg-accent text-accent-foreground font-semibold" : ""}`}
        >
          <MoonStar size={16} />
          <span>Dark</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme("system")}
          className={`flex items-center gap-2 cursor-pointer ${theme === "system" ? "bg-accent text-accent-foreground font-semibold" : ""}`}
        >
          <Settings size={16} />
          <span>System</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
