import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { pageData } from "@/lib/catalog/pages";
import { loadGlyphs } from "@/lib/catalog/server";
import { OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/site";
import { IdentityMark, Glyph } from "@/components/IdentityMark";
import { EmbedSnippet } from "@/components/EmbedSnippet";

export const dynamicParams = false;

export function generateStaticParams() {
  return pageData().categories.map((c) => ({ slug: c.slug }));
}

type Params = { params: Promise<{ slug: string }> };

const authText = (raw: string, kind: string) => (kind === "none" ? "No auth" : raw || "Auth unknown");

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
  const noKey = c.entries.filter((e) => e.auth === "none").length;
  return (
    <div className="page narrow category-page" data-testid="category-page">
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
      <section aria-labelledby="embed-h">
        <h2 id="embed-h">Show this category on your site</h2>
        <EmbedSnippet kind="category" value={c.slug} limit={6} />
      </section>
    </div>
  );
}
