import type { Metadata } from "next";
import Link from "next/link";
import { pageData } from "@/lib/catalog/pages";
import { loadGlyphs } from "@/lib/catalog/server";
import { SITE_URL } from "@/lib/site";
import { Glyph } from "@/components/IdentityMark";
import { categoryColor } from "@/lib/explore/colors";

export const metadata: Metadata = {
  title: "API categories",
  description: "Every category of free and public APIs on ApiWall, from Animals to Weather, with how many APIs each has.",
  alternates: { canonical: `${SITE_URL}/categories/` },
};

export default function CategoriesPage() {
  const { categories, entries } = pageData();
  const glyphs = loadGlyphs();
  return (
    <div className="page narrow" data-testid="categories-page">
      <p className="eyebrow">Browse</p>
      <h1>API categories</h1>
      <p className="lede">
        {entries.length.toLocaleString("en")} public APIs in {categories.length} categories. Prefer an A–Z list? See <Link href="/apis/">all APIs</Link>.
      </p>
      <ul className="cat-grid">
        {categories.map((c) => (
          <li key={c.slug}>
            <Link href={`/categories/${c.slug}/`}>
              <i style={{ background: categoryColor(c.index, false) }} aria-hidden="true" />
              <Glyph paths={glyphs[c.glyph]} size={16} />
              <span>{c.name}</span>
              <small>{c.entries.length}</small>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
