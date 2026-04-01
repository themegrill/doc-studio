import type { NextConfig } from "next";

const apiBaseUrl = process.env.API_BASE_URL || "http://localhost:3000";

const nextConfig: NextConfig = {
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
