import { BadgeVariant } from "@/components/ui/badge-pro";

export interface ParsedTitle {
  cleanTitle: string;
  badges: Array<{
    variant: BadgeVariant;
    text: string;
  }>;
  hasHTML: boolean;
}

/**
 * Parse title HTML and extract badge information
 * Supports:
 * - <span class="premium-feature">Pro</span>
 * - <span class="new-feature">New</span>
 * - <span class="beta-feature">Beta</span>
 * - <span class="deprecated-feature">Deprecated</span>
 */
export function parseTitleWithBadges(title: string): ParsedTitle {
  if (!title) {
    return { cleanTitle: "", badges: [], hasHTML: false };
  }

  // Check if title contains HTML
  const hasHTML = /<[^>]+>/.test(title);

  if (!hasHTML) {
    return { cleanTitle: title, badges: [], hasHTML: false };
  }

  const badges: Array<{ variant: BadgeVariant; text: string }> = [];
  let cleanTitle = title;

  // Map of class names to badge variants
  const badgeMap: Record<string, BadgeVariant> = {
    "premium-feature": "pro",
    "new-feature": "new",
    "beta-feature": "beta",
    "deprecated-feature": "deprecated",
  };

  // Extract badges from HTML
  const spanRegex = /<span\s+class="([^"]+)"[^>]*>([^<]+)<\/span>/gi;
  let match;

  while ((match = spanRegex.exec(title)) !== null) {
    const className = match[1];
    const text = match[2];

    // Check if this is a known badge class
    if (badgeMap[className]) {
      badges.push({
        variant: badgeMap[className],
        text: text,
      });
    }

    // Remove the HTML tag from the clean title
    cleanTitle = cleanTitle.replace(match[0], "").trim();
  }

  // Also handle simple case without class attribute
  const simpleSpanRegex = /<span[^>]*>(Pro|New|Beta|Deprecated)<\/span>/gi;
  cleanTitle = cleanTitle.replace(simpleSpanRegex, (match, text) => {
    const lowerText = text.toLowerCase();
    if (lowerText === "pro" && !badges.some(b => b.variant === "pro")) {
      badges.push({ variant: "pro", text: "Pro" });
    }
    return "";
  }).trim();

  // Clean up extra whitespace
  cleanTitle = cleanTitle.replace(/\s+/g, " ").trim();

  return { cleanTitle, badges, hasHTML };
}

/**
 * Strip all HTML tags from a title (for search, slugs, etc.)
 */
export function stripTitleHTML(title: string): string {
  return parseTitleWithBadges(title).cleanTitle;
}
