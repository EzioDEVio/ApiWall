"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AuditEntry, Submission, SubmissionStatus } from "@/lib/providers/types";
import { ACCESS_LABELS } from "@/lib/providers/types";
import { LogoReview } from "./LogoReview";

type Tab = SubmissionStatus | "all";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}

export function ReviewDashboard() {
  const [subs, setSubs] = useState<Submission[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("pending");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Lives here so the confirmation survives the panel re-mounting with fresh data.
  const [msg, setMsg] = useState<Message>(null);
  const [area, setArea] = useState<"submissions" | "logos">("submissions");
  const [pendingLogos, setPendingLogos] = useState<number | null>(null);

  const load = useCallback(() => {
    api<{ submissions: Submission[] }>("/api/review/submissions")
      .then((b) => {
        setSubs(b.submissions);
        setLoadError(null);
      })
      .catch((e: Error) => setLoadError(e.message));
  }, []);
  useEffect(load, [load]);
  useEffect(() => {
    api<{ logos: { status: string }[] }>("/api/review/logos")
      .then((b) => setPendingLogos(b.logos.filter((l) => l.status === "pending").length))
      .catch(() => setPendingLogos(null));
  }, []);

  const shown = useMemo(() => (subs ?? []).filter((s) => tab === "all" || s.status === tab), [subs, tab]);
  const selected = subs?.find((s) => s.id === selectedId) ?? null;

  async function logout() {
    await fetch("/api/review/logout", { method: "POST" });
    window.location.reload();
  }

  return (
    <div className="page review">
      <div className="review-head">
        <div>
          <p className="eyebrow">Reviewer</p>
          <h1>{area === "submissions" ? "Submissions" : "Logos"}</h1>
        </div>
        <button type="button" className="btn btn-quiet" onClick={logout}>
          Sign out
        </button>
      </div>
      <div className="segmented review-areas" role="group" aria-label="Review area">
        <button type="button" aria-pressed={area === "submissions"} onClick={() => setArea("submissions")}>
          Provider submissions ({(subs ?? []).filter((s) => s.status === "pending").length} pending)
        </button>
        <button type="button" aria-pressed={area === "logos"} onClick={() => setArea("logos")}>
          Logos{pendingLogos !== null ? ` (${pendingLogos} pending)` : ""}
        </button>
      </div>
      {area === "logos" ? (
        <LogoReview onCount={setPendingLogos} />
      ) : (
        <>
          <div className="segmented" role="group" aria-label="Filter by status">
            {(["pending", "approved", "rejected", "removed", "all"] as Tab[]).map((t) => (
              <button key={t} type="button" aria-pressed={tab === t} onClick={() => setTab(t)}>
                {t[0]!.toUpperCase() + t.slice(1)} ({(subs ?? []).filter((s) => t === "all" || s.status === t).length})
              </button>
            ))}
          </div>
          {loadError && (
            <p className="field-error" role="alert">
              {loadError}
            </p>
          )}
          {!subs && !loadError && <p role="status">Loading submissions…</p>}
          <div className="review-grid">
            <ul className="review-list" aria-label="Submissions">
              {shown.length === 0 && subs && <li className="muted">Nothing here.</li>}
              {shown.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    aria-pressed={selectedId === s.id}
                    onClick={() => {
                      setSelectedId(s.id);
                      setMsg(null);
                    }}
                  >
                    <strong>{s.apiName}</strong>
                    <span className="muted small">
                      {s.providerName} · {s.request} · {s.status} · {new Date(s.createdAt).toLocaleDateString("en")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {selected ? (
              <ReviewPanel key={selected.id + selected.updatedAt} sub={selected} onChanged={load} msg={msg} setMsg={setMsg} />
            ) : (
              <p className="muted">Select a submission to review it.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

type Message = { kind: "ok" | "error"; text: string } | null;

function ReviewPanel({ sub, onChanged, msg, setMsg }: { sub: Submission; onChanged: () => void; msg: Message; setMsg: (m: Message) => void }) {
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  useEffect(() => {
    api<{ audit: AuditEntry[] }>(`/api/review/audit?submission=${sub.id}`)
      .then((b) => setAudit(b.audit))
      .catch(() => setAudit([]));
  }, [sub.id, sub.updatedAt]);

  async function act(action: unknown, ok: string) {
    setMsg(null);
    try {
      await api(`/api/review/submissions/${sub.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(action) });
      setMsg({ kind: "ok", text: ok });
      onChanged();
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
    }
  }

  const form = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    return Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>;
  };

  return (
    <article className="review-panel" aria-labelledby="rp-h">
      <h2 id="rp-h">
        {sub.apiName} <span className="tag">{sub.status}</span>
      </h2>
      {msg && (
        <p className={msg.kind === "ok" ? "notice" : "field-error"} role={msg.kind === "ok" ? "status" : "alert"}>
          {msg.text}
        </p>
      )}
      <dl className="kv">
        <dt>Request</dt>
        <dd>{sub.request}</dd>
        <dt>Provider</dt>
        <dd>{sub.providerName}</dd>
        <dt>Contact</dt>
        <dd>{sub.contactEmail}</dd>
        <dt>Website</dt>
        <dd>
          <a href={sub.website} target="_blank" rel="noopener noreferrer nofollow">
            {sub.website}
          </a>
        </dd>
        <dt>Docs</dt>
        <dd>
          <a href={sub.docsUrl} target="_blank" rel="noopener noreferrer nofollow">
            {sub.docsUrl}
          </a>
        </dd>
        <dt>Category</dt>
        <dd>{sub.category}</dd>
        <dt>Description</dt>
        <dd>{sub.description}</dd>
        <dt>Auth / HTTPS / CORS</dt>
        <dd>
          {sub.auth} / {sub.https} / {sub.cors}
        </dd>
        <dt>Claimed terms</dt>
        <dd>{sub.claim.pricing}</dd>
        <dt>Claimed rate limits</dt>
        <dd>{sub.claim.rateLimits}</dd>
        <dt>Claim source</dt>
        <dd>
          <a href={sub.claim.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">
            {sub.claim.sourceUrl}
          </a>
        </dd>
        {sub.catalogListingId && (
          <>
            <dt>Catalog entry</dt>
            <dd>
              <a href={`/?api=${encodeURIComponent(sub.catalogListingId)}`}>{sub.catalogListingId}</a> (claims attach to it; its catalog facts never change)
            </dd>
          </>
        )}
        <dt>Logo</dt>
        <dd>
          {sub.logoFile ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/review/submissions/${sub.id}/logo`} alt={`Uploaded logo for ${sub.apiName}`} width={64} height={64} className="review-logo" />
          ) : (
            "No file"
          )}
          {sub.logoUrl && (
            <>
              {" "}
              · reference:{" "}
              <a href={sub.logoUrl} target="_blank" rel="noopener noreferrer nofollow">
                {sub.logoUrl}
              </a>
            </>
          )}
        </dd>
        {sub.demo && (
          <>
            <dt>Demo proposal</dt>
            <dd>
              {sub.demo.useCase} · endpoints: {sub.demo.endpoints} · limits: {sub.demo.requestLimits} · paid by: {sub.demo.costOwner} · user data:{" "}
              {sub.demo.userData} · abuse: {sub.demo.abuseContact}
              <br />
              <em>In-site demos are disabled on this deployment; see docs/DEMOS.md.</em>
            </dd>
          </>
        )}
        <dt>Verified claim</dt>
        <dd>{sub.review.verifiedClaim ? `${ACCESS_LABELS[sub.review.verifiedClaim.status]}, checked ${sub.review.verifiedClaim.verifiedAt}` : "None"}</dd>
        {sub.review.reason && (
          <>
            <dt>Reason</dt>
            <dd>{sub.review.reason}</dd>
          </>
        )}
      </dl>

      {sub.status === "pending" && (
        <form
          className="review-action"
          onSubmit={(e) => {
            const f = form(e);
            act({ type: "approve", sponsored: f.sponsored === "on", logo: f.logo === "on", note: f.note }, "Approved and published.");
          }}
        >
          <h3>Approve</h3>
          {sub.request === "sponsored-tile" && !sub.catalogListingId && (
            <label className="check">
              <input type="checkbox" name="sponsored" /> <span>Approve as a sponsored tile (shown with a Sponsored label)</span>
            </label>
          )}
          {sub.logoFile && (
            <label className="check">
              <input type="checkbox" name="logo" /> <span>Logo checked: official and appropriate to display</span>
            </label>
          )}
          <label className="field">
            <span>Note (optional)</span>
            <input name="note" maxLength={300} />
          </label>
          <button type="submit" className="btn btn-primary">
            Approve
          </button>
        </form>
      )}

      {sub.status !== "removed" && (
        <form
          className="review-action"
          onSubmit={(e) => {
            const f = form(e);
            const fields: Record<string, string> = {};
            for (const k of ["providerName", "apiName", "website", "docsUrl", "category", "description", "auth", "https", "cors"])
              if (f[k] !== undefined) fields[k] = f[k]!;
            act({ type: "edit", fields }, "Saved.");
          }}
        >
          <h3>Edit provider-stated facts</h3>
          <div className="grid2">
            {(["providerName", "apiName", "website", "docsUrl", "category"] as const).map((k) => (
              <label className="field" key={k}>
                <span>{k}</span>
                <input name={k} defaultValue={sub[k]} />
              </label>
            ))}
            <label className="field">
              <span>auth</span>
              <select name="auth" defaultValue={sub.auth}>
                {["No", "apiKey", "OAuth", "Other"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>https</span>
              <select name="https" defaultValue={sub.https}>
                {["yes", "no", "unknown"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>cors</span>
              <select name="cors" defaultValue={sub.cors}>
                {["yes", "no", "unknown"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            <span>description</span>
            <textarea name="description" defaultValue={sub.description} rows={3} maxLength={280} />
          </label>
          <button type="submit" className="btn">
            Save edits
          </button>
        </form>
      )}

      {(sub.status === "pending" || sub.status === "approved") && (
        <form
          className="review-action"
          onSubmit={(e) => {
            const f = form(e);
            act(
              {
                type: "verify-claim",
                claim: {
                  status: f.status,
                  sourceUrl: f.sourceUrl,
                  verifiedAt: f.verifiedAt,
                  limits: f.limits,
                  eligibility: f.eligibility,
                  expiration: f.expiration,
                  terms: f.terms,
                },
              },
              "Claim verified.",
            );
          }}
        >
          <h3>Verify access claim</h3>
          <p className="muted small">Only record what you checked on the provider&apos;s own page today. Every field is shown publicly.</p>
          <div className="grid2">
            <label className="field">
              <span>Status</span>
              <select name="status" defaultValue="provider-confirmed-free-tier">
                <option value="provider-confirmed-free-tier">{ACCESS_LABELS["provider-confirmed-free-tier"]}</option>
                <option value="paid-or-other">{ACCESS_LABELS["paid-or-other"]}</option>
              </select>
            </label>
            <label className="field">
              <span>Source URL (https)</span>
              <input name="sourceUrl" type="url" required defaultValue={sub.claim.sourceUrl} />
            </label>
            <label className="field">
              <span>Date verified</span>
              <input name="verifiedAt" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
            </label>
            <label className="field">
              <span>Limits / quota</span>
              <input name="limits" required defaultValue={sub.claim.rateLimits} />
            </label>
            <label className="field">
              <span>Eligibility</span>
              <input name="eligibility" required placeholder="e.g. Non-commercial use" />
            </label>
            <label className="field">
              <span>Expiration</span>
              <input name="expiration" required placeholder="e.g. No expiry stated" />
            </label>
          </div>
          <label className="field">
            <span>Terms summary</span>
            <textarea name="terms" required rows={2} defaultValue={sub.claim.pricing} />
          </label>
          <div className="row">
            <button type="submit" className="btn">
              Verify claim
            </button>
            {sub.review.verifiedClaim && (
              <button type="button" className="btn btn-quiet" onClick={() => act({ type: "clear-claim" }, "Claim cleared.")}>
                Clear verified claim
              </button>
            )}
          </div>
        </form>
      )}

      {(sub.status === "pending" || sub.status === "approved") && (
        <form
          className="review-action danger"
          onSubmit={(e) => {
            const f = form(e);
            act({ type: sub.status === "pending" ? "reject" : "remove", reason: f.reason }, sub.status === "pending" ? "Rejected." : "Removed from the site.");
          }}
        >
          <h3>{sub.status === "pending" ? "Reject" : "Remove"}</h3>
          <label className="field">
            <span>Reason (recorded in the audit log)</span>
            <input name="reason" required minLength={3} maxLength={300} />
          </label>
          <button type="submit" className="btn btn-danger">
            {sub.status === "pending" ? "Reject submission" : "Remove listing"}
          </button>
        </form>
      )}

      <section aria-labelledby="audit-h">
        <h3 id="audit-h">Audit trail</h3>
        <ol className="audit">
          {audit.map((a, i) => (
            <li key={i}>
              <time dateTime={a.at}>{new Date(a.at).toLocaleString("en")}</time> · <strong>{a.action}</strong> by {a.actor}
              {a.note ? ` — ${a.note}` : ""}
              {a.changes && Object.keys(a.changes).length > 0 && <code className="small"> {Object.keys(a.changes).join(", ")}</code>}
            </li>
          ))}
        </ol>
      </section>
    </article>
  );
}
