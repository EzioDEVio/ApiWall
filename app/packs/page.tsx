import type { Metadata } from "next";
import Link from "next/link";
import { pageData } from "@/lib/catalog/pages";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Starter packs",
  description: "Ready-made collections of public APIs for common jobs: no key needed, browser-ready, weather apps, money data, open data and more.",
  alternates: { canonical: `${SITE_URL}/packs/` },
};

export default function PacksPage() {
  const { packs } = pageData();
  return (
    <div className="page narrow" data-testid="packs-page">
      <p className="eyebrow">Browse</p>
      <h1>Starter packs</h1>
      <p className="lede">
        Ready-made collections for common jobs. Each pack is a simple rule over facts ApiWall records (auth, HTTPS, CORS, category and the weekly docs-link
        check), so it stays accurate as APIs come and go.
      </p>
      <ul className="pack-grid">
        {packs.map((p) => (
          <li key={p.slug}>
            <Link href={`/packs/${p.slug}/`} data-testid="pack-card">
              <span className="pack-emoji" aria-hidden="true">
                {p.emoji}
              </span>
              <span className="pack-title">{p.title}</span>
              <span className="pack-blurb">{p.blurb}</span>
              <small>{p.entries.length.toLocaleString("en")} APIs</small>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
