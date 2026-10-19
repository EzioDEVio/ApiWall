import { isUpstream } from "@/lib/catalog/types";
import type { Metadata } from "next";
import { loadSnapshot } from "@/lib/catalog/server";
import { ANALYTICS_ORIGIN, GOATCOUNTER_CODE } from "@/lib/analytics";

export const metadata: Metadata = { title: "About & Source" };

const fmt = (iso: string) => new Date(iso).toLocaleString("en", { dateStyle: "long", timeStyle: "short", timeZone: "UTC" }) + " UTC";

export default function AboutPage() {
  const s = loadSnapshot();
  const upstream = s.listings.filter(isUpstream);
  const api = upstream.filter((l) => l.kind === "api").length;
  const mcp = upstream.length - api;
  const supplementCategories = new Set((s.supplements ?? []).map((x) => x.slug));
  const upstreamCategories = s.categories.filter((c) => !supplementCategories.has(c.slug)).length;
  const aiListings = s.listings.filter((l) => l.aiModel);
  const brand = Object.values(s.marks).filter((m) => m.type === "brand").length;
  const logos = Object.values(s.marks).filter((m) => m.type === "image").length;
  const src = s.source;
  return (
    <div className="page narrow prose">
      <p className="eyebrow">About &amp; Source</p>
      <h1>Where the data comes from</h1>
      <p className="lede">
        ApiWall is an independent explorer for the community-maintained{" "}
        <a href={`https://github.com/${src.repo}`} target="_blank" rel="noopener noreferrer">
          {src.repo}
        </a>{" "}
        catalog. It is not affiliated with or endorsed by the catalog&apos;s maintainers or by the listed providers.
      </p>

      <h2>Current snapshot</h2>
      <dl className="kv" data-testid="snapshot-info">
        <dt>Listings</dt>
        <dd>
          {api.toLocaleString("en")} HTTP APIs and {mcp} MCP servers in {upstreamCategories} upstream categories
          {s.supplements?.length ? `, plus ${s.supplements.map((x) => `${x.providers} curated ${x.name} entries`).join(", ")}` : ""}
        </dd>
        <dt>Upstream commit</dt>
        <dd>{src.commit ? <a href={`https://github.com/${src.repo}/tree/${src.commit}`} target="_blank" rel="noopener noreferrer"><code>{src.commit}</code></a> : "Not resolved"}</dd>
        <dt>README hash</dt>
        <dd>
          <code>sha256:{src.contentSha256.slice(0, 16)}…</code>
        </dd>
        <dt>Imported</dt>
        <dd>
          {fmt(src.importedAt)} ({src.fetchedFrom === "network" ? "fetched from GitHub" : src.fetchedFrom === "cache" ? "rebuilt from the cached README" : "imported from a local file"})
        </dd>
        <dt>Import notes</dt>
        <dd>{s.warnings.length ? s.warnings.join("; ") : "None"}</dd>
      </dl>

      <h2>What is imported</h2>
      <ul>
        <li>Each category table: name, description, authentication, HTTPS and CORS exactly as written, plus the documentation link and the README line.</li>
        <li>The README&apos;s MCP Servers table, as a separate listing type with transport and install links. MCP servers are labelled wherever they appear.</li>
        <li>Promotional banners and sponsor tables outside the catalog are skipped and never shown as listings.</li>
        <li>
          Nothing about price, free access, uptime or safety is inferred. Those appear only when a provider submits a claim and a reviewer verifies it against a
          source. A listing here does not mean an API is free, live or safe to call.
        </li>
      </ul>

      {s.supplements?.map((sup) => (
        <section key={sup.slug} aria-labelledby={`sup-${sup.slug}`} data-testid="supplement-info">
          <h2 id={`sup-${sup.slug}`}>{sup.name}: a curated supplement</h2>
          <p>
            {sup.about} Source file: <code>{sup.file}</code>. {sup.providers} entries were added by ApiWall; {sup.crossTagged} upstream listings are also tagged{" "}
            {sup.name} and keep their original category.
          </p>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Listing</th>
                <th scope="col">Origin</th>
                <th scope="col">Models named in the docs</th>
                <th scope="col">Docs checked</th>
              </tr>
            </thead>
            <tbody>
              {aiListings.map((l) => (
                <tr key={l.id}>
                  <td>{l.name}</td>
                  <td>{l.origin === "supplement" ? "Added by ApiWall" : `Upstream (${l.category})`}</td>
                  <td>{l.aiModel!.models}</td>
                  <td>
                    <a href={l.aiModel!.docsUrl} target="_blank" rel="noopener noreferrer nofollow">
                      {new URL(l.aiModel!.docsUrl).hostname}
                    </a>
                    , {l.aiModel!.verifiedAt}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {sup.notVerified.length > 0 && (
            <>
              <p>Not included, because their documentation could not be confirmed when checked:</p>
              <ul>
                {sup.notVerified.map((n) => (
                  <li key={n.provider}>
                    {n.provider}: {n.reason}.
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="muted">Free tiers and pricing were not verified for any of these and are shown as Unknown. Generic machine-learning tools stay in Machine Learning.</p>
        </section>
      ))}

      <h2>Tile marks</h2>
      <p>
        The upstream catalog has no logos. {logos > 0 ? `${logos.toLocaleString("en")} tiles show the logo published by the provider's own website: the icon its home page declares, or its favicon, or for projects hosted on GitHub the owner's avatar. Those files were downloaded once, checked, and are served from ApiWall; each listing's panel names the page it came from. ` : ""}
        {brand} tiles show a brand mark from{" "}
        <a href="https://simpleicons.org" target="_blank" rel="noopener noreferrer">
          Simple Icons
        </a>{" "}
        (icon data CC0-1.0), and only when that project recorded the mark from the listing&apos;s own domain and the listing name identifies it. Every other tile
        gets a generated monogram. Icons that many unrelated sites share, such as a hosting platform&apos;s default, are discarded. Marks remain trademarks of their owners and are shown only to identify the service. Provider logos appear only after review.
        Category icons are from{" "}
        <a href="https://tabler.io/icons" target="_blank" rel="noopener noreferrer">
          Tabler Icons
        </a>{" "}
        (MIT).
      </p>

      <h2>The map</h2>
      <p>
        The mosaic is a 1,000 × 1,000 grid of logical cells. Each listing owns a 16 × 16-cell tile, grouped into category bands. Placements are saved with the
        snapshot, so refreshing the catalog keeps existing tiles where they are and new listings take free space in their band. The bottom of the map is reserved for
        reviewed provider listings.
      </p>

      <h2 id="privacy">Privacy</h2>
      {GOATCOUNTER_CODE ? (
        <p data-testid="privacy-analytics">
          ApiWall counts visits with{" "}
          <a href="https://www.goatcounter.com/" target="_blank" rel="noopener noreferrer">
            GoatCounter
          </a>
          , without cookies or any other storage on your device. Each count is one request to <code>{new URL(ANALYTICS_ORIGIN).host}</code> with the page
          address (never what you search for), the page title, the site you came from and your screen size. Opening an API, choosing a category or starter
          pack and exporting a list are counted the same way, by name. Nothing is counted when your browser sends Do Not Track or Global Privacy Control.
          Saved APIs, your theme and your lists stay in your browser and are never sent anywhere.
        </p>
      ) : (
        <p data-testid="privacy-analytics">
          This copy of ApiWall does not count visits. Saved APIs, your theme and your lists stay in your browser and are never sent anywhere.
        </p>
      )}

      <h2>License</h2>
      <p>
        Catalog data: MIT License, {src.license.notice}.{" "}
        <a href={src.license.url} target="_blank" rel="noopener noreferrer">
          Full license text
        </a>
        . ApiWall reproduces the catalog&apos;s facts with this notice and links each listing back to its source line.
      </p>
      <p>
        The JSON service mentioned in the README (
        <a href="https://github.com/davemachado/public-api" target="_blank" rel="noopener noreferrer">
          davemachado/public-api
        </a>
        ) is not used: it did not respond when checked, and ApiWall reads its own snapshot instead.
      </p>
    </div>
  );
}
