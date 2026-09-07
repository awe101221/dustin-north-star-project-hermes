import type { NextConfig } from "next";

/**
 * Hermes runs on Vercel with the App Router. Nothing here depends on secrets:
 * the build must succeed with no environment variables at all (CI proves it),
 * and every Supabase read degrades to a clear "not configured" state.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: false,
  experimental: {
    // Keep server-only helpers (service-role client, pg) out of client bundles.
    serverComponentsHmrCache: true,
  },
  serverExternalPackages: ["pg"],
  images: {
    remotePatterns: [],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
