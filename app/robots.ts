import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

// Search engines only read robots.txt at the root of a domain. On a project page
// (eziodevio.github.io/ApiWall) submit the sitemap in Google Search Console instead;
// with a custom domain this file is picked up directly.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin/", "/review/", "/api/review/", "/api/submissions/"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
