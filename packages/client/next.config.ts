import type { NextConfig } from "next";

const apiBaseUrl = process.env.API_BASE_URL || "http://localhost:3000";
const projectSlug = process.env.PROJECT_SLUG || "default";

const nextConfig: NextConfig = {
  // Bake these into the build so every server component gets the right values
  // regardless of how Vercel injects runtime env vars.
  env: {
    API_BASE_URL: apiBaseUrl,
    PROJECT_SLUG: projectSlug,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "themegrill.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "http",
        hostname: "localhost",
        port: "3000",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
        port: "",
        pathname: "/**",
      },
      // Allow images from the configured API base URL (production main app)
      ...(apiBaseUrl.startsWith("https://")
        ? [
            {
              protocol: "https" as const,
              hostname: new URL(apiBaseUrl).hostname,
              port: "",
              pathname: "/**",
            },
          ]
        : []),
    ],
  },
  async rewrites() {
    return [
      {
        // Proxy all API calls (including auth) to the main doc-studio app.
        // This means auth cookies set by the main app are forwarded here,
        // so editing features work seamlessly when both run on the same domain/subdomain.
        source: "/api/:path*",
        destination: `${apiBaseUrl}/api/:path*`,
      },
      {
        // Proxy uploaded assets (logos, images) from the admin server.
        source: "/uploads/:path*",
        destination: `${apiBaseUrl}/uploads/:path*`,
      },
    ];
  },
};

export default nextConfig;
