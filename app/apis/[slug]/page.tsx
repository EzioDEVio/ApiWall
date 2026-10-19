import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { pageData, related, summary } from "@/lib/catalog/pages";
import { loadGlyphs, loadSnapshot } from "@/lib/catalog/server";
import { explainAuth, explainCors, explainHttps, triLabel } from "@/lib/explore/explain";
import { OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/site";
import { PUBLIC_API_VERSION } from "@/lib/catalog/publicApi";
import { IdentityMark, Glyph } from "@/components/IdentityMark";
import { EmbedSnippet } from "@/components/EmbedSnippet";
import { LinkStatus } from "@/components/LinkStatus";
import { LinkHistoryBar } from "@/components/LinkHistoryBar";
import { linkSpans } from "@/lib/catalog/linkHistory";

export const dynamicParams = false;

export function generateStaticParams() {
  return pageData().entries.map((e) => ({ slug: e.slug! }));
}

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const e = pageData().bySlug.get((await params).slug);
  if (!e) return {};
  const title = e.kind === "mcp" ? `${e.name} (MCP server)` : /\bapi\b/i.test(e.name) ? e.name : `${e.name} API`;
  const url = `${SITE_URL}/apis/${e.slug}/`;
  const description = summary(e);
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "article", title: `${title} · ${SITE_NAME}`, description, url, images: [OG_IMAGE] },
    twitter: { card: "summary_large_image", title: `${title} · ${SITE_NAME}`, description, images: [OG_IMAGE] },
  };
}

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en", { dateStyle: "long", timeZone: "UTC" });
function host(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default async function ApiPage({ params }: Params) {
  const data = pageData();
  const e = data.bySlug.get((await params).slug);
  if (!e) notFound();
  const cat = data.categoryBySlug.get(e.categorySlug);
  const glyphs = loadGlyphs();
  const snap = loadSnapshot();
  const also = e.tags
    .filter((t) => t !== e.categorySlug)
    .map((t) => data.categoryBySlug.get(t))
    .filter((c) => !!c);
  const near = related(e);
  const crumbs = [
    { name: SITE_NAME, url: `${SITE_URL}/` },
    { name: "Categories", url: `${SITE_URL}/categories/` },
    ...(cat ? [{ name: cat.name, url: `${SITE_URL}/categories/${cat.slug}/` }] : []),
    { name: e.name, url: `${SITE_URL}/apis/${e.slug}/` },
  ];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: c.url })),
  };

  return (
    <article className="page narrow api-page" data-testid="api-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <nav aria-label="Breadcrumb" className="crumbs">
        <ol>
          <li>
            <Link href="/">{SITE_NAME}</Link>
          </li>
          <li>
            <Link href="/categories/">Categories</Link>
          </li>
          {cat && (
            <li>
              <Link href={`/categories/${cat.slug}/`}>{cat.name}</Link>
            </li>
          )}
          <li aria-current="page">{e.name}</li>
        </ol>
      </nav>

      <header className="api-head">
        <IdentityMark mark={e.mark} name={e.name} categoryIndex={cat?.index ?? 0} size={72} />
        <div>
          <p className="eyebrow">
            <Glyph paths={glyphs[cat?.glyph ?? ""]} size={14} />
            {e.kind === "mcp" ? "MCP server" : `${e.category} API`}
            {e.origin === "supplement" && <span className="tag tag-ai">Curated by ApiWall</span>}
          </p>
          <h1>{e.name}</h1>
        </div>
      </header>
      <p className="lede">{e.description || "No description in the catalog."}</p>

      <div className="row api-actions">
        {e.url ? (
          <a className="btn btn-primary" href={e.url} target="_blank" rel="noopener noreferrer nofollow" data-testid="docs-link" data-track={`docs/${e.slug}`}>
            Official docs on {host(e.url)} <span aria-hidden="true">↗</span>
          </a>
        ) : (
          <span className="muted">The catalog link for this entry could not be read.</span>
        )}
        <Link className="btn" href={`/?api=${encodeURIComponent(e.id)}`}>
          Show on the wall
        </Link>
      </div>
      <LinkStatus state={e.link} />
      {e.url && <LinkHistoryBar spans={linkSpans(data.history, e.id)} />}

      <section aria-labelledby="facts-h">
        <h2 id="facts-h">{e.origin === "supplement" ? "Facts from the provider's docs" : "Catalog facts"}</h2>
        <dl className="facts">
          <div>
            <dt>Authentication</dt>
            <dd>
              <code>{e.raw.auth || "(blank)"}</code>
              <span>{explainAuth(e.auth, e.raw.auth)}</span>
            </dd>
          </div>
          {e.kind === "mcp" ? (
            <div>
              <dt>Transport</dt>
              <dd>
                <code>{e.raw.transport || "(blank)"}</code>
                <span>How an AI client connects to this server.</span>
              </dd>
            </div>
          ) : (
            <>
              <div>
                <dt>HTTPS</dt>
                <dd>
                  <code>{e.raw.https || triLabel(e.https)}</code>
                  <span>{explainHttps(e.https, e.kind)}</span>
                </dd>
              </div>
              <div>
                <dt>CORS</dt>
                <dd>
                  <code>{e.raw.cors || triLabel(e.cors)}</code>
                  <span>{explainCors(e.cors, e.kind)}</span>
                </dd>
              </div>
            </>
          )}
        </dl>
      </section>

      {e.aiModel && (
        <section aria-labelledby="ai-h">
          <h2 id="ai-h">AI model API, checked by ApiWall</h2>
          <dl className="claim-grid">
            <dt>Provider</dt>
            <dd>{e.aiModel.provider}</dd>
            <dt>Models</dt>
            <dd>{e.aiModel.models}</dd>
            <dt>Authentication</dt>
            <dd>{e.aiModel.authDetail}</dd>
            {e.aiModel.apiHost && (
              <>
                <dt>API host</dt>
                <dd>
                  <code>{e.aiModel.apiHost}</code>
                </dd>
              </>
            )}
            <dt>Docs checked</dt>
            <dd>
              <a href={e.aiModel.docsUrl} target="_blank" rel="noopener noreferrer nofollow">
                {host(e.aiModel.docsUrl)}
              </a>{" "}
              on {fmtDay(e.aiModel.verifiedAt + "T00:00:00Z")}
            </dd>
            <dt>Free tier</dt>
            <dd>Not verified. Check the provider&apos;s pricing page.</dd>
          </dl>
        </section>
      )}

      {e.kind === "mcp" && e.install && e.install.length > 0 && (
        <section aria-labelledby="install-h">
          <h2 id="install-h">Install from</h2>
          <ul>
            {e.install.map((l) => (
              <li key={l.url}>
                <a href={l.url} target="_blank" rel="noopener noreferrer nofollow">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="access-h">
        <h2 id="access-h">Access and pricing</h2>
        <p className="muted">
          ApiWall has not verified pricing, free access or usage terms for this API. A listing here does not mean it is free, available or safe to call. Check
          the provider&apos;s current terms.
        </p>
      </section>

      {(also.length > 0 || cat) && (
        <section aria-labelledby="cats-h">
          <h2 id="cats-h">Listed in</h2>
          <ul className="chip-links">
            {[...(cat ? [cat] : []), ...also].map((c) => (
              <li key={c.slug}>
                <Link href={`/categories/${c.slug}/`}>{c.name}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {near.length > 0 && cat && (
        <section aria-labelledby="near-h">
          <h2 id="near-h">More {cat.name} APIs</h2>
          <ul className="api-links">
            {near.map((x) => (
              <li key={x.id}>
                <Link href={`/apis/${x.slug}/`}>
                  <IdentityMark mark={x.mark} name={x.name} categoryIndex={cat.index} size={28} />
                  <span>{x.name}</span>
                </Link>
              </li>
            ))}
          </ul>
          <p>
            <Link href={`/categories/${cat.slug}/`}>
              All {cat.entries.length.toLocaleString("en")} in {cat.name} →
            </Link>
          </p>
        </section>
      )}

      <section aria-labelledby="dev-h">
        <h2 id="dev-h">Use this listing</h2>
        <p>Show a card for {e.name} on your own site (it links back here):</p>
        <EmbedSnippet kind="api" value={e.id} />
        <p className="muted small">
          As JSON: <a href={`${SITE_URL}/api/${PUBLIC_API_VERSION}/apis/${e.id}.json`}>{`/api/${PUBLIC_API_VERSION}/apis/${e.id}.json`}</a> ·{" "}
          <Link href="/developers/">Developers</Link>
        </p>
      </section>

      <p className="muted small source-note">
        {e.origin === "supplement" ? (
          <>Curated by ApiWall from the provider&apos;s documentation.</>
        ) : (
          <>
            From the{" "}
            <a href={`https://github.com/${snap.source.repo}`} target="_blank" rel="noopener noreferrer">
              public-apis
            </a>{" "}
            community catalog (MIT){e.sourceLine ? `, README line ${e.sourceLine}` : ""}.
          </>
        )}{" "}
        {e.addedAt ? `On ApiWall since ${fmtDay(e.addedAt)}. ` : ""}ApiWall is independent and not affiliated with this provider.
      </p>
    </article>
  );
}
