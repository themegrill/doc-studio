import type { MetadataRoute } from "next";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host");
  const protocol =
    requestHeaders.get("x-forwarded-proto") || (host?.startsWith("localhost") ? "http" : "https");

  const baseUrl = host ? `${protocol}://${host}` : undefined;

  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    ...(baseUrl && {
      host: baseUrl,
      sitemap: `${baseUrl}/sitemap.xml`,
    }),
  };
}
