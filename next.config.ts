import type { NextConfig } from "next";

// Security headers apply to every route. The CSP blocks third-party images and scripts:
// identity marks are bundled with the catalog snapshot, never hotlinked.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

// Static export for GitHub Pages (npm run build:static): no server, so no headers() and no API routes.
const isStatic = process.env.NEXT_PUBLIC_STATIC === "1";
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");

const staticConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: "export",
  // Its own build folder, so a static build never replaces the server build that `npm start` uses.
  distDir: ".next-static",
  basePath: basePath || undefined,
  trailingSlash: true,
  images: { unoptimized: true },
};

const serverConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        // Logo files are plain images; never let one be interpreted as a document.
        source: "/marks/:file*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=604800" },
          { key: "Content-Disposition", value: "inline" },
        ],
      },
    ];
  },
};

export default isStatic ? staticConfig : serverConfig;
