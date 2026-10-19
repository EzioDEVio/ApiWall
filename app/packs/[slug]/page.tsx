import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { pageData } from "@/lib/catalog/pages";
import { OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/site";
import { PUBLIC_API_VERSION } from "@/lib/catalog/publicApi";
import { IdentityMark } from "@/components/IdentityMark";
import { EmbedSnippet } from "@/components/EmbedSnippet";

export const dynamicParams = false;

export function generateStaticParams() {
  return pageData().packs.map((p) => ({ slug: p.slug }));
}

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const p = pageData().packBySlug.get((await params).slug);
  if (!p) return {};
  const title = `${p.title}: ${p.entries.length} APIs`;
  const description = `${p.blurb} ${p.entries
    .slice(0, 5)
    .map((e) => e.name)
    .join(", ")} and more.`;
  const url = `${SITE_URL}/packs/${p.slug}/`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title: `${title} · ${SITE_NAME}`, description, url, images: [OG_IMAGE] },
    twitter: { card: "summary_large_image", title: `${title} · ${SITE_NAME}`, description, images: [OG_IMAGE] },
  };
}

const authText = (raw: string, kind: string) => (kind === "none" ? "No auth" : raw || "Auth unknown");

export default async function PackPage({ params }: Params) {
  const { packBySlug, categoryBySlug, packs } = pageData();
  const p = packBySlug.get((await params).slug);
  if (!p) notFound();
  const others = packs.filter((x) => x.slug !== p.slug);
  return (
    <div className="page narrow category-page pack-page" data-testid="pack-page">
      <nav aria-label="Breadcrumb" className="crumbs">
        <ol>
          <li>
            <Link href="/">{SITE_NAME}</Link>
          </li>
          <li>
            <Link href="/packs/">Starter packs</Link>
          </li>
          <li aria-current="page">{p.title}</li>
        </ol>
      </nav>
      <header className="pack-hero">
        <span className="pack-emoji" aria-hidden="true">
          {p.emoji}
        </span>
        <div>
          <p className="eyebrow">Starter pack</p>
          <h1>{p.title}</h1>
        </div>
      </header>
      <p className="lede">{p.blurb}</p>
      <p className="pack-rule">
        <strong>{p.entries.length.toLocaleString("en")} APIs</strong> · Included because: {p.rule}
      </p>
      <div className="row">
        <Link className="btn btn-primary" href={p.wall} data-track={`pack-wall/${p.slug}`}>
          See them on the wall
        </Link>
        <a className="btn" href={`${SITE_URL}/api/${PUBLIC_API_VERSION}/packs/${p.slug}.json`} data-track={`pack-json/${p.slug}`}>
          As JSON
        </a>
      </div>
      <ul className="api-list">
        {p.entries.map((e) => (
          <li key={e.id}>
            <Link href={`/apis/${e.slug}/`} className="api-row">
              <IdentityMark mark={e.mark} name={e.name} categoryIndex={categoryBySlug.get(e.categorySlug)?.index ?? 0} size={40} />
              <span className="api-row-main">
                <span className="api-row-name">{e.name}</span>
                <span className="api-row-desc">
                  {e.category} · {e.description}
                </span>
              </span>
              <span className="api-row-facts">
                <span className="chip">{authText(e.raw.auth, e.auth)}</span>
                {e.kind === "mcp" ? <span className="chip">MCP</span> : e.cors === "yes" ? <span className="chip">CORS</span> : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <section aria-labelledby="embed-h">
        <h2 id="embed-h">Show this pack on your site</h2>
        <EmbedSnippet kind="pack" value={p.slug} limit={6} />
      </section>
      <section aria-labelledby="more-h">
        <h2 id="more-h">More starter packs</h2>
        <ul className="pack-grid compact">
          {others.map((o) => (
            <li key={o.slug}>
              <Link href={`/packs/${o.slug}/`}>
                <span className="pack-emoji" aria-hidden="true">
                  {o.emoji}
                </span>
                <span className="pack-title">{o.title}</span>
                <small>{o.entries.length} APIs</small>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
