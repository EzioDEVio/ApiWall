import type { MetadataRoute } from "next";
import { pageData } from "@/lib/catalog/pages";
import { loadSnapshot } from "@/lib/catalog/server";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

/** sitemap.xml: the wall, every API page and every category page, for search engines. */
export default function sitemap(): MetadataRoute.Sitemap {
  const { entries, categories, packs } = pageData();
  const updated = loadSnapshot().source.importedAt;
  const page = (p: string, priority: number, lastModified?: string) => ({ url: `${SITE_URL}${p}`, priority, ...(lastModified ? { lastModified } : {}) });
  return [
    page("/", 1, updated),
    page("/apis/", 0.8, updated),
    page("/categories/", 0.8, updated),
    page("/changes/", 0.5, updated),
    page("/packs/", 0.8, updated),
    page("/stats/", 0.6, updated),
    page("/developers/", 0.5),
    page("/about/", 0.3),
    page("/submit/", 0.3),
    page("/providers/", 0.3),
    ...categories.map((c) => page(`/categories/${c.slug}/`, 0.7, updated)),
    ...packs.map((p) => page(`/packs/${p.slug}/`, 0.7, updated)),
    ...entries.map((e) => page(`/apis/${e.slug}/`, 0.6, e.addedAt)),
  ];
}
