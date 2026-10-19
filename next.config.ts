import type { NextConfig } from "next";

const goatRaw = (process.env.NEXT_PUBLIC_GOATCOUNTER ?? "").trim().toLowerCase();
const goat = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(goatRaw) ? goatRaw : "";

// Security headers apply to every route. The CSP blocks third-party images and scripts:
// identity marks are bundled with the catalog snapshot, never hotlinked.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""),
  "style-src 'self' 'unsafe-inline'",
  // GoatCounter counts are image requests; allowed only when NEXT_PUBLIC_GOATCOUNTER is set (see lib/analytics.ts).
  `img-src 'self' data: blob:${goat ? ` https://${goat}.goatcounter.com` : ""}`,
  "font-src 'self'",
  "connect-src 'self' https://api.github.com", // the admin page talks to GitHub with the reviewer's own token
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
  basePath: basePath || undefined,
  trailingSlash: true,
  images: { unoptimized: true },
  // The static build sets the server routes aside, so it type-checks the site without the tests
  // (which import those routes). `npm run typecheck` still checks everything, tests included.
  typescript: { tsconfigPath: "tsconfig.build.json" },
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
