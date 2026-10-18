import type { MetadataRoute } from "next";
import { SITE_NAME } from "@/lib/site";

// Needed for `output: "export"` (the static Pages build).
export const dynamic = "force-static";

/**
 * Lets browsers install ApiWall as an app. Every URL here is relative to the manifest itself,
 * so the same file works at the domain root and under the /ApiWall base path.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME}: every public API on one wall`,
    short_name: SITE_NAME,
    description: "Browse public APIs and MCP servers on a zoomable wall. Works offline with the last catalog you opened.",
    id: "./",
    start_url: "./",
    scope: "./",
    display: "standalone",
    background_color: "#0c0e14",
    theme_color: "#0c0e14",
    categories: ["developer", "productivity", "utilities"],
    icons: [
      { src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Starter packs", url: "packs/" },
      { name: "Catalog stats", url: "stats/" },
      { name: "What's new", url: "changes/" },
    ],
  };
}
