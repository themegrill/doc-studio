import { cn } from "@/lib/utils";

export type BadgeVariant = "pro" | "new" | "beta" | "deprecated";

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  pro: "bg-gradient-to-r from-amber-500 to-orange-500 text-white",
  new: "bg-gradient-to-r from-blue-500 to-cyan-500 text-white",
  beta: "bg-gradient-to-r from-purple-500 to-pink-500 text-white",
  deprecated: "bg-gray-400 text-white",
};

export function Badge({ variant = "pro", children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide ml-2",
        variantStyles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
