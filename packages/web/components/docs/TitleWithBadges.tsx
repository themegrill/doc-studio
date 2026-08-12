import { Badge } from "@/components/ui/badge-pro";
import { parseTitleWithBadges } from "@/lib/parse-title-badges";

/**
 * Renders a document or section title, turning its embedded badge markup into
 * real badges.
 *
 * Titles are stored with the badge inline as HTML — `Managing Users <span
 * class="premium-feature">Pro</span>` — so anywhere that renders `title`
 * directly leaks that markup to the reader as literal text. This is the one
 * place that knows how to display a title, so new surfaces cannot forget.
 *
 * Deliberately hook-free so it works in both server and client components.
 * Parsing a short title is cheap enough not to need memoising.
 */
export function TitleWithBadges({
  title,
  className,
  badgeClassName = "ml-1.5 text-[10px] px-1.5 py-0",
}: {
  title: string;
  className?: string;
  badgeClassName?: string;
}) {
  const { cleanTitle, badges } = parseTitleWithBadges(title);

  return (
    <span className={className ?? "inline-flex items-center"}>
      {cleanTitle}
      {badges.map((badge, index) => (
        <Badge
          key={`badge-${index}-${badge.text}`}
          variant={badge.variant}
          className={badgeClassName}
        >
          {badge.text}
        </Badge>
      ))}
    </span>
  );
}
