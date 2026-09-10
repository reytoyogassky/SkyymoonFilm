import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",

  // Reduce bundle size by removing the X-Powered-By header
  poweredByHeader: false,

  // Enable gzip/brotli compression
  compress: true,

  images: {
    // Allow TMDB and DiceBear image domains
    remotePatterns: [
      { protocol: "https", hostname: "image.tmdb.org" },
      { protocol: "https", hostname: "api.dicebear.com" },
    ],
    // Limit generated sizes to what the app actually uses
    deviceSizes: [640, 750, 1080, 1920],
    imageSizes: [64, 128, 256, 384],
    // Serve modern formats
    formats: ["image/avif", "image/webp"],
  },

  async headers() {
    return [
      {
        // Cache static assets aggressively (JS/CSS chunks are content-hashed)
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        // Cache poster/backdrop images from local catalog
        source: "/idlix-data/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=43200" },
        ],
      },
      {
        // Cache local assets (logos, icons)
        source: "/assets/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" },
        ],
      },
      {
        // API routes: prevent caching of dynamic stream/proxy endpoints by default
        source: "/api/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
