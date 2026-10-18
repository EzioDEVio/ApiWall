"use client";

import { useEffect, useRef, useState } from "react";
import type { Entry } from "@/lib/explore/model";
import type { SnapshotSource } from "@/lib/catalog/types";
import { ACCESS_LABELS } from "@/lib/providers/types";
import { explainAuth, explainCors, explainHttps, triLabel } from "@/lib/explore/explain";
import { Glyph, IdentityMark } from "./IdentityMark";
import { LogoSuggest } from "./LogoSuggest";
import { CodeSamples } from "./CodeSamples";
import { copyText } from "@/lib/clipboard";
import { issueUrl } from "@/lib/site";

interface Props {
  entry: Entry | null;
  onClose: () => void;
  source: SnapshotSource;
  categoryIndex: number;
  glyph: string[] | undefined;
  dark: boolean;
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

export function DetailDialog({ entry, onClose, source, categoryIndex, glyph, dark }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (entry && !d.open) d.showModal();
    if (!entry && d.open) d.close();
  }, [entry]);

  const markSource = entry ? (
    <>
      {entry.mark.type === "logo" && entry.mark.source && (
        <span className="logo-source" data-testid="logo-source">
          {" "}
          Logo: {entry.mark.reviewed ? entry.mark.source.basis : entry.mark.source.basis.toLowerCase()} (
          <a href={entry.mark.source.page} target="_blank" rel="noopener noreferrer nofollow">
            {hostLabel(entry.mark.source.page)}
          </a>
          {entry.mark.source.fetchedAt ? `, saved ${fmtDate(entry.mark.source.fetchedAt)}` : ""}
          ).
        </span>
      )}
      {entry.mark.type === "brand" && <span className="logo-source"> Mark: {entry.mark.title}, from the Simple Icons set.</span>}
    </>
  ) : null;

  return (
    <dialog
      ref={ref}
      className="detail"
      aria-labelledby="detail-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close(); // click on backdrop
      }}
      data-testid="detail-dialog"
    >
      {entry && (
        <div className="detail-body">
          <button type="button" className="detail-close" onClick={() => ref.current?.close()} aria-label="Close details">
            <span aria-hidden="true">×</span>
          </button>

          <header className="detail-head">
            <IdentityMark mark={entry.mark} name={entry.name} categoryIndex={categoryIndex} size={64} dark={dark} />
            <div className="detail-titles">
              <p className="eyebrow">
                <Glyph paths={glyph} size={14} />
                {entry.category}
                {entry.kind === "mcp" && <span className="tag">MCP server</span>}
                {entry.source === "provider" && <span className="tag tag-provider">◆ Provider-submitted, reviewed</span>}
                {entry.sponsored && <span className="tag tag-sponsor">★ Sponsored</span>}
                {entry.tags.includes("ai-models") && entry.categorySlug !== "ai-models" && <span className="tag tag-ai">Also in AI Models</span>}
              </p>
              <h2 id="detail-title">{entry.name}</h2>
              {entry.providerName && <p className="muted small">by {entry.providerName}</p>}
            </div>
          </header>

          <p className="detail-desc">{entry.description || "No description in the catalog."}</p>

          {entry.aiModel && (
            <section aria-labelledby="ai-h" className="ai-model" data-testid="ai-model">
              <h3 id="ai-h" className="section-h">
                AI model API, checked by ApiWall
              </h3>
              <dl className="claim-grid">
                <dt>Provider</dt>
                <dd>{entry.aiModel.provider}</dd>
                <dt>Models</dt>
                <dd>{entry.aiModel.models}</dd>
                <dt>Authentication</dt>
                <dd>{entry.aiModel.authDetail}</dd>
                {entry.aiModel.apiHost && (
                  <>
                    <dt>API host</dt>
                    <dd>
                      <code>{entry.aiModel.apiHost}</code>
                    </dd>
                  </>
                )}
                <dt>Docs checked</dt>
                <dd>
                  <a href={entry.aiModel.docsUrl} target="_blank" rel="noopener noreferrer nofollow">
                    {hostLabel(entry.aiModel.docsUrl)} <span aria-hidden="true">↗</span>
                    <span className="sr-only"> (opens an external site)</span>
                  </a>{" "}
                  on {fmtDate(entry.aiModel.verifiedAt + "T00:00:00Z")}
                </dd>
                <dt>Free tier</dt>
                <dd>Not verified. Check the provider&apos;s pricing page.</dd>
              </dl>
            </section>
          )}

          <section aria-labelledby="facts-h">
            <h3 id="facts-h" className="section-h">
              {entry.origin === "supplement"
                ? "Facts from the provider's docs, as checked"
                : entry.source === "catalog"
                  ? "Catalog facts, as imported"
                  : "Provider-stated facts, reviewed"}
            </h3>
            <dl className="facts">
              <div>
                <dt>Authentication</dt>
                <dd>
                  <code>{entry.raw.auth || "(blank)"}</code>
                  <span>{explainAuth(entry.auth, entry.raw.auth)}</span>
                </dd>
              </div>
              {entry.kind === "mcp" ? (
                <div>
                  <dt>Transport</dt>
                  <dd>
                    <code>{entry.raw.transport || "(blank)"}</code>
                    <span>How an AI client connects to this server. HTTPS and CORS do not apply to MCP listings.</span>
                  </dd>
                </div>
              ) : (
                <>
                  <div>
                    <dt>HTTPS</dt>
                    <dd>
                      <code>{entry.raw.https || triLabel(entry.https)}</code>
                      <span>{explainHttps(entry.https, entry.kind)}</span>
                    </dd>
                  </div>
                  <div>
                    <dt>CORS</dt>
                    <dd>
                      <code>{entry.raw.cors || triLabel(entry.cors)}</code>
                      <span>{explainCors(entry.cors, entry.kind)}</span>
                    </dd>
                  </div>
                </>
              )}
            </dl>
          </section>

          {entry.kind === "mcp" && entry.install && entry.install.length > 0 && (
            <section aria-labelledby="install-h">
              <h3 id="install-h" className="section-h">
                Install from
              </h3>
              <ul className="inline-links">
                {entry.install.map((l) => (
                  <li key={l.url}>
                    <a href={l.url} target="_blank" rel="noopener noreferrer nofollow">
                      {l.label} <span aria-hidden="true">↗</span>
                      <span className="sr-only"> (opens an external site)</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="access-h" className="access">
            <h3 id="access-h" className="section-h">
              Access and pricing
            </h3>
            {entry.claim ? (
              <div className="claim" data-testid="verified-claim">
                <p>
                  <strong>{ACCESS_LABELS[entry.claim.status]}</strong>
                  {entry.claimProvider ? ` — stated by ${entry.claimProvider}, checked by a ApiWall reviewer` : " — checked by a ApiWall reviewer"}
                </p>
                <dl className="claim-grid">
                  <dt>Limits</dt>
                  <dd>{entry.claim.limits}</dd>
                  <dt>Eligibility</dt>
                  <dd>{entry.claim.eligibility}</dd>
                  <dt>Expiration</dt>
                  <dd>{entry.claim.expiration}</dd>
                  <dt>Terms</dt>
                  <dd>{entry.claim.terms}</dd>
                  <dt>Last verified</dt>
                  <dd>{fmtDate(entry.claim.verifiedAt + "T00:00:00Z")}</dd>
                  <dt>Source</dt>
                  <dd>
                    <a href={entry.claim.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">
                      Provider terms <span aria-hidden="true">↗</span>
                      <span className="sr-only"> (opens an external site)</span>
                    </a>
                  </dd>
                </dl>
              </div>
            ) : (
              <p className="muted" data-testid="access-unknown">
                <strong>Unknown.</strong> ApiWall has not verified pricing, free access or usage terms for this API. A listing here does not mean it is free,
                available or safe to call. Check the provider&apos;s current terms.
              </p>
            )}
            <p className="muted small">No in-site demo is offered for this listing.</p>
          </section>

          <div className="detail-actions">
            <div className="row detail-buttons">
              {entry.url ? (
                <a className="btn btn-primary" href={entry.url} target="_blank" rel="noopener noreferrer nofollow" data-testid="docs-link">
                  Open official documentation <span aria-hidden="true">↗</span>
                </a>
              ) : (
                <p className="muted">The catalog link for this entry could not be read, so no link is shown.</p>
              )}
              <CopyEntryLink />
            </div>
            {entry.url && <p className="muted small leaves">Opens {hostLabel(entry.url)} in a new tab. You are leaving ApiWall.</p>}
          </div>

          <CodeSamples entry={entry} />

          {entry.source === "catalog" && (
            <section aria-labelledby="logo-h" className="logo-section">
              <h3 id="logo-h" className="section-h">
                Logo
              </h3>
              <LogoSuggest key={entry.id} listingId={entry.id} listingName={entry.name} hasLogo={entry.mark.type !== "monogram"} siteUrl={entry.url} />
            </section>
          )}

          {entry.source === "catalog" && (
            <p className="muted small report-link">
              Something wrong or out of date?{" "}
              <a
                href={issueUrl("report-listing.yml", `Listing: ${entry.name}`, { listing: entry.id, name: entry.name })}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="report-link"
              >
                Report it on GitHub <span aria-hidden="true">↗</span>
              </a>
            </p>
          )}

          <footer className="detail-source">
            {entry.origin === "supplement" ? (
              <span data-testid="supplement-source">
                Added by ApiWall to the AI Models category from its curated list (<code>data/ai-models.json</code>), checked against the provider&apos;s
                official documentation
                {entry.aiModel ? ` on ${fmtDate(entry.aiModel.verifiedAt + "T00:00:00Z")}` : ""}. This entry is not part of the upstream public-apis catalog.
                {markSource}
              </span>
            ) : entry.source === "catalog" ? (
              <>
                From{" "}
                <a href={`https://github.com/${source.repo}`} target="_blank" rel="noopener noreferrer">
                  {source.repo}
                </a>
                {entry.sourceLine ? `, README line ${entry.sourceLine}` : ""}. Snapshot{" "}
                {source.commit ? <code>{source.commit.slice(0, 7)}</code> : <code>{source.contentSha256.slice(0, 7)}</code>}, imported{" "}
                {fmtDate(source.importedAt)}.{entry.alsoListedIn?.length ? ` Also listed under ${entry.alsoListedIn.join(", ")}.` : ""} Community-sourced;
                confirm details with the provider.
                {entry.aiModel && " ApiWall also lists it under AI Models from its curated list; the upstream category is unchanged."}
                {markSource}
              </>
            ) : (
              <>Submitted by the provider and approved by a ApiWall reviewer. This entry is not part of the upstream public-apis catalog.</>
            )}
          </footer>
        </div>
      )}
    </dialog>
  );
}

function hostLabel(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return "the provider's site";
  }
}

/** The address bar already holds ?api=<id>, so copying it shares this listing. */
function CopyEntryLink() {
  const [state, setState] = useState<"idle" | "ok" | "error">("idle");
  return (
    <button
      type="button"
      className="btn"
      onClick={async () => {
        setState((await copyText(window.location.href)) ? "ok" : "error");
        setTimeout(() => setState("idle"), 1800);
      }}
      data-testid="copy-api-link"
    >
      {state === "ok" ? "Link copied ✓" : state === "error" ? "Copy failed" : "Copy link"}
    </button>
  );
}
