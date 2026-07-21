import Link from "next/link";
import { ChevronRight } from "lucide-react";

export interface BreadcrumbItem {
  title: string;
  href?: string; // omit for the current/active page
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export default function Breadcrumb({ items }: BreadcrumbProps) {
  if (items.length === 0) return null;

  return (
    <nav className="flex items-center flex-wrap gap-0.5 text-sm text-gray-500 mb-4">
      {items.map((item, index) => (
        <span key={index} className="flex items-center gap-0.5">
          {index > 0 && (
            <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0 mx-0.5" />
          )}
          {item.href ? (
            <Link
              href={item.href}
              className="hover:text-gray-800 transition-colors"
            >
              {item.title}
            </Link>
          ) : (
            <span className="text-blue-600">{item.title}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
