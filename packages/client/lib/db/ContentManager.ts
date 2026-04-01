/**
 * Type-only stub for @/lib/db/ContentManager.
 *
 * The client package has no direct database access — all data is fetched from
 * the main doc-studio API. This file re-exports the same interfaces so that
 * synced components (DocsLayoutClient, DocRenderer, etc.) can import from
 * @/lib/db/ContentManager without changes.
 */

export type { Navigation, NavRoute, DocContent, Block } from "@/lib/api";

// Re-export DocMeta in case any component needs it
export interface DocMeta {
  id?: string;
  title: string;
  description?: string;
  slug: string;
  createdAt?: string;
  updatedAt?: string;
  published?: boolean;
  orderIndex?: number;
}
