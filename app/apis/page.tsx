import type { Metadata } from "next";
import Link from "next/link";
import { pageData } from "@/lib/catalog/pages";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "All APIs, A to Z",
  description: "Every free and public API on ApiWall in one alphabetical list, each with its own page of auth, HTTPS, CORS and docs.",
  alternates: { canonical: `${SITE_URL}/apis/` },
};

export default function AllApisPage() {
  const { entries } = pageData();
  const groups = new Map<string, typeof entries>();
  for (const e of entries) {
    const ch = e.name[0]?.toUpperCase() ?? "#";
    const k = /[A-Z]/.test(ch) ? ch : "#";
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  const keys = [...groups.keys()].sort((a, b) => (a === "#" ? -1 : b === "#" ? 1 : a.localeCompare(b)));
  return (
    <div className="page narrow" data-testid="all-apis-page">
      <p className="eyebrow">Browse</p>
      <h1>All APIs, A to Z</h1>
      <p className="lede">
        {entries.length.toLocaleString("en")} APIs and MCP servers. Prefer browsing by topic? See the <Link href="/categories/">categories</Link>.
      </p>
      <nav aria-label="Jump to letter" className="az-jump">
        {keys.map((k) => (
          <a key={k} href={`#letter-${k === "#" ? "0" : k}`}>
            {k}
          </a>
        ))}
      </nav>
      {keys.map((k) => (
        <section key={k} aria-labelledby={`letter-${k === "#" ? "0" : k}`}>
          <h2 id={`letter-${k === "#" ? "0" : k}`}>{k}</h2>
          <ul className="az-list">
            {groups.get(k)!.map((e) => (
              <li key={e.id}>
                <Link href={`/apis/${e.slug}/`}>{e.name}</Link> <span className="muted small">{e.category}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
