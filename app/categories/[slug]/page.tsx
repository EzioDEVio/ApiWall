import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { pageData } from "@/lib/catalog/pages";
import { loadGlyphs } from "@/lib/catalog/server";
import { OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/site";
import { IdentityMark, Glyph } from "@/components/IdentityMark";
import { EmbedSnippet } from "@/components/EmbedSnippet";
import { StatTile } from "@/components/Charts";
import { categoryColor } from "@/lib/explore/colors";
import { pct } from "@/lib/catalog/stats";
import type { Entry } from "@/lib/explore/model";

export const dynamicParams = false;

export function generateStaticParams() {
  return pageData().categories.map((c) => ({ slug: c.slug }));
}

type Params = { params: Promise<{ slug: string }> };

const authText = (raw: string, kind: string) => (kind === "none" ? "No auth" : raw || "Auth unknown");

/**
 * "Quick starts": APIs you can try right away. A rule over recorded facts (no key, HTTPS, CORS,
 * docs link reachable), never a ranking; recognisable logos first, then A to Z.
 */
function quickStarts(entries: Entry[]): Entry[] {
  return entries
    .filter((e) => e.kind === "api" && e.auth === "none" && e.https === "yes" && e.cors === "yes" && e.link.state === "reachable")
    .sort((a, b) => Number(b.mark.type !== "monogram") - Number(a.mark.type !== "monogram") || a.name.localeCompare(b.name, "en"))
    .slice(0, 6);
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const c = pageData().categoryBySlug.get((await params).slug);
  if (!c) return {};
  const title = `${c.name} APIs`;
  const description = `${c.entries.length} free and public ${c.name} APIs, with auth, HTTPS and CORS for each: ${c.entries
    .slice(0, 6)
    .map((e) => e.name)
    .join(", ")} and more.`;
  const url = `${SITE_URL}/categories/${c.slug}/`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title: `${title} · ${SITE_NAME}`, description, url, images: [OG_IMAGE] },
    twitter: { card: "summary_large_image", title: `${title} · ${SITE_NAME}`, description, images: [OG_IMAGE] },
  };
}

export default async function CategoryPage({ params }: Params) {
  const c = pageData().categoryBySlug.get((await params).slug);
  if (!c) notFound();
  const glyphs = loadGlyphs();
  const { packs } = pageData();
  const noKey = c.entries.filter((e) => e.auth === "none").length;
  const apis = c.entries.filter((e) => e.kind === "api");
  const checked = c.entries.filter((e) => e.link.state !== "unchecked");
  const reachable = checked.filter((e) => e.link.state === "reachable").length;
  const picks = quickStarts(c.entries);
  const inPacks = packs.filter((p) => p.entries.some((e) => e.categorySlug === c.slug || e.tags.includes(c.slug)));
  const band = { "--cat": categoryColor(c.index, false), "--cat-dark": categoryColor(c.index, true) } as React.CSSProperties;
  return (
    <div className="page narrow category-page" data-testid="category-page" style={band}>
      <div className="cat-band" aria-hidden="true" />
      <nav aria-label="Breadcrumb" className="crumbs">
        <ol>
          <li>
            <Link href="/">{SITE_NAME}</Link>
          </li>
          <li>
            <Link href="/categories/">Categories</Link>
          </li>
          <li aria-current="page">{c.name}</li>
        </ol>
      </nav>
      <p className="eyebrow">
        <Glyph paths={glyphs[c.glyph]} size={14} /> Category
      </p>
      <h1>{c.name} APIs</h1>
      <p className="lede">
        {c.entries.length.toLocaleString("en")} {c.entries.length === 1 ? "API" : "APIs"}
        {noKey ? `, ${noKey} of them with no auth listed` : ""}. Each one links to its own page with auth, HTTPS, CORS and the official docs.
      </p>
      <div className="row">
        <Link className="btn btn-primary" href={`/?cat=${c.slug}`}>
          See them on the wall
        </Link>
      </div>
      <div className="stat-tiles compact" data-testid="category-stats">
        <StatTile label="APIs" value={c.entries.length.toLocaleString("en")} />
        <StatTile label="No auth listed" value={`${pct(noKey, c.entries.length)}%`} note={`${noKey} of ${c.entries.length}`} />
        {apis.length > 0 && <StatTile label="HTTPS" value={`${pct(apis.filter((e) => e.https === "yes").length, apis.length)}%`} />}
        {apis.length > 0 && <StatTile label="CORS enabled" value={`${pct(apis.filter((e) => e.cors === "yes").length, apis.length)}%`} />}
        {checked.length > 0 && <StatTile label="Docs link reachable" value={`${pct(reachable, checked.length)}%`} note="at the last weekly check" />}
      </div>
      {picks.length > 0 && (
        <section aria-labelledby="picks-h" data-testid="quick-starts">
          <h2 id="picks-h">Quick starts</h2>
          <p className="muted small">No key, HTTPS and CORS, and the docs link answered at the last check: call these from a web page in minutes.</p>
          <ul className="pick-grid">
            {picks.map((e) => (
              <li key={e.id}>
                <Link href={`/apis/${e.slug}/`} className="pick-card">
                  <IdentityMark mark={e.mark} name={e.name} categoryIndex={c.index} size={36} />
                  <span className="pick-name">{e.name}</span>
                  <span className="pick-desc">{e.description}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <h2 className="all-h">All {c.name} APIs</h2>
      <ul className="api-list">
        {c.entries.map((e) => (
          <li key={e.id}>
            <Link href={`/apis/${e.slug}/`} className="api-row">
              <IdentityMark mark={e.mark} name={e.name} categoryIndex={c.index} size={40} />
              <span className="api-row-main">
                <span className="api-row-name">{e.name}</span>
                <span className="api-row-desc">{e.description}</span>
              </span>
              <span className="api-row-facts">
                <span className="chip">{authText(e.raw.auth, e.auth)}</span>
                {e.kind === "mcp" ? <span className="chip">MCP</span> : e.cors === "yes" ? <span className="chip">CORS</span> : null}
                {e.link.state === "unreachable" && <span className="chip chip-down">Link down</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {inPacks.length > 0 && (
        <section aria-labelledby="packs-h">
          <h2 id="packs-h">Starter packs with {c.name} APIs</h2>
          <ul className="pack-grid compact">
            {inPacks.map((p) => (
              <li key={p.slug}>
                <Link href={`/packs/${p.slug}/`} data-testid="category-pack">
                  <span className="pack-emoji" aria-hidden="true">
                    {p.emoji}
                  </span>
                  <span className="pack-title">{p.title}</span>
                  <span className="pack-blurb">{p.entries.length.toLocaleString("en")} APIs</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section aria-labelledby="embed-h">
        <h2 id="embed-h">Show this category on your site</h2>
        <EmbedSnippet kind="category" value={c.slug} limit={6} />
      </section>
    </div>
  );
}
