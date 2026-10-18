"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { LogoStatus, LogoSuggestion } from "@/lib/logos/types";
import type { CatalogSnapshot } from "@/lib/catalog/types";
import type { PublicProviderPayload } from "@/lib/providers/types";

type Tab = LogoStatus | "all";
type Message = { kind: "ok" | "error"; text: string } | null;

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}

/** Reviewer view of logo suggestions, plus a direct upload for any catalog listing. */
export function LogoReview({ onCount }: { onCount: (pending: number) => void }) {
  const [logos, setLogos] = useState<LogoSuggestion[] | null>(null);
  const [tab, setTab] = useState<Tab>("pending");
  const [msg, setMsg] = useState<Message>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ logos: LogoSuggestion[] }>("/api/review/logos")
      .then((b) => {
        setLogos(b.logos);
        setLoadError(null);
        onCount(b.logos.filter((l) => l.status === "pending").length);
      })
      .catch((e: Error) => setLoadError(e.message));
  }, [onCount]);
  useEffect(load, [load]);

  async function act(id: string, action: unknown, ok: string) {
    setMsg(null);
    try {
      await api(`/api/review/logos/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(action) });
      setMsg({ kind: "ok", text: ok });
      load();
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
    }
  }

  const shown = (logos ?? []).filter((l) => tab === "all" || l.status === tab);

  return (
    <div className="logo-review" data-testid="logo-review">
      <DirectUpload
        onDone={(text) => {
          setMsg({ kind: "ok", text });
          load();
        }}
        onError={(text) => setMsg({ kind: "error", text })}
      />

      <h2>Suggested logos</h2>
      <div className="segmented" role="group" aria-label="Filter logos by status">
        {(["pending", "approved", "rejected", "replaced", "removed", "all"] as Tab[]).map((t) => (
          <button key={t} type="button" aria-pressed={tab === t} onClick={() => setTab(t)}>
            {t[0]!.toUpperCase() + t.slice(1)} ({(logos ?? []).filter((l) => t === "all" || l.status === t).length})
          </button>
        ))}
      </div>
      {msg && (
        <p className={msg.kind === "ok" ? "notice" : "field-error"} role={msg.kind === "ok" ? "status" : "alert"}>
          {msg.text}
        </p>
      )}
      {loadError && (
        <p className="field-error" role="alert">
          {loadError}
        </p>
      )}
      {!logos && !loadError && <p role="status">Loading logos…</p>}
      <ul className="logo-review-list" aria-label="Logo suggestions">
        {logos && shown.length === 0 && <li className="muted">Nothing here.</li>}
        {shown.map((l) => (
          <li key={l.id} className="logo-review-item" data-testid="logo-item">
            {l.file ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/review/logos/${l.id}/image?v=${l.updatedAt}`} alt={`Suggested logo for ${l.listingName}`} className="review-logo" />
            ) : (
              <span className="review-logo muted small">No file</span>
            )}
            <div>
              <strong>
                <a href={`/?api=${encodeURIComponent(l.listingId)}`} target="_blank" rel="noopener noreferrer">
                  {l.listingName}
                </a>
              </strong>{" "}
              <span className="tag">{l.status}</span> <span className="tag">{l.origin === "reviewer" ? "reviewer upload" : "visitor suggestion"}</span>
              <dl className="kv small">
                <dt>Source</dt>
                <dd>
                  <a href={l.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">
                    {l.sourceUrl}
                  </a>
                </dd>
                {l.note && (
                  <>
                    <dt>Note</dt>
                    <dd>{l.note}</dd>
                  </>
                )}
                <dt>Received</dt>
                <dd>{new Date(l.createdAt).toLocaleString("en")}</dd>
                {l.file && (
                  <>
                    <dt>File</dt>
                    <dd>
                      {l.file.mime}, {Math.round(l.file.bytes / 1024)} KB
                    </dd>
                  </>
                )}
                {l.reason && (
                  <>
                    <dt>Reason</dt>
                    <dd>{l.reason}</dd>
                  </>
                )}
              </dl>
              {l.status === "pending" && (
                <div className="row">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => act(l.id, { type: "approve" }, `Approved. ${l.listingName} now shows this logo.`)}
                  >
                    Approve logo
                  </button>
                  <ReasonForm label="Reject" onSubmit={(reason) => act(l.id, { type: "reject", reason }, "Rejected; the file was deleted.")} />
                </div>
              )}
              {l.status === "approved" && (
                <ReasonForm label="Remove" onSubmit={(reason) => act(l.id, { type: "remove", reason }, "Removed; the tile shows its previous mark again.")} />
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReasonForm({ label, onSubmit }: { label: string; onSubmit: (reason: string) => void }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(String(new FormData(e.currentTarget).get("reason") ?? ""));
      }}
    >
      <input name="reason" required minLength={3} maxLength={300} placeholder="Reason (kept in the audit log)" aria-label={`${label} reason`} />
      <button type="submit" className="btn btn-danger">
        {label}
      </button>
    </form>
  );
}

interface Pick {
  id: string;
  name: string;
  category: string;
  url: string | null;
  hasLogo: boolean;
}

/** Search the catalog, pick a listing (by default only those without a logo) and publish a logo for it. */
function DirectUpload({ onDone, onError }: { onDone: (t: string) => void; onError: (t: string) => void }) {
  const [listings, setListings] = useState<Pick[] | null>(null);
  const [q, setQ] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [picked, setPicked] = useState<Pick | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([api<CatalogSnapshot>("/api/catalog"), api<PublicProviderPayload>("/api/providers/public").catch(() => null)])
      .then(([cat, prov]) => {
        const approved = new Set((prov?.logoOverrides ?? []).map((o) => o.listingId));
        setListings(
          cat.listings.map((l) => ({
            id: l.id,
            name: l.name,
            category: l.category,
            url: l.url,
            hasLogo: approved.has(l.id) || (!!cat.marks[l.id] && cat.marks[l.id]!.type !== "monogram"),
          })),
        );
      })
      .catch(() => setListings([]));
  }, []);

  const missing = useMemo(() => (listings ?? []).filter((l) => !l.hasLogo).length, [listings]);
  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (listings ?? [])
      .filter((l) => (!onlyMissing || !l.hasLogo) && (!t || l.name.toLowerCase().includes(t) || l.category.toLowerCase().includes(t)))
      .slice(0, 30);
  }, [listings, q, onlyMissing]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!picked) return onError("Choose a listing first.");
    const el = e.currentTarget; // React clears currentTarget after an await
    const fd = new FormData(el);
    fd.set("listingId", picked.id);
    setBusy(true);
    try {
      await api("/api/review/logos", { method: "POST", body: fd });
      onDone(`Published a logo for ${picked.name}.`);
      setListings((ls) => ls?.map((l) => (l.id === picked.id ? { ...l, hasLogo: true } : l)) ?? null);
      setPicked(null);
      el.reset();
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="review-action" onSubmit={submit} aria-labelledby="du-h" data-testid="direct-logo-upload">
      <h2 id="du-h">Add a logo to a listing</h2>
      <p className="muted small">
        {listings ? `${missing.toLocaleString("en")} of ${listings.length.toLocaleString("en")} listings have no logo yet. ` : ""}A logo you upload here is
        published at once and replaces any earlier approved one. Use the provider&apos;s own logo and record where it is published.
      </p>
      <div className="grid2">
        <label className="field">
          <span>Find a listing</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or category" />
        </label>
        <label className="check">
          <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} /> <span>Only listings without a logo</span>
        </label>
      </div>
      <ul className="listing-picker" aria-label="Matching listings">
        {listings === null && <li className="muted small">Loading the catalog…</li>}
        {listings && matches.length === 0 && <li className="muted small">No matches.</li>}
        {matches.map((l) => (
          <li key={l.id}>
            <button type="button" aria-pressed={picked?.id === l.id} onClick={() => setPicked(l)}>
              <span>{l.name}</span>
              <span className="muted small">
                {l.category} · {l.hasLogo ? "has a logo" : "no logo"}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {picked && (
        <>
          <p>
            Selected: <strong>{picked.name}</strong>
          </p>
          <div className="grid2">
            <label className="field">
              <span>Logo image (PNG, JPEG or WebP, up to 256 KB)</span>
              <input name="logoFile" type="file" accept="image/png,image/jpeg,image/webp" required />
            </label>
            <label className="field">
              <span>Where the provider publishes it (https)</span>
              <input key={picked.id} name="sourceUrl" type="url" required defaultValue={picked.url?.startsWith("https://") ? picked.url : ""} />
            </label>
          </div>
          <label className="field">
            <span>Note (optional)</span>
            <input name="note" maxLength={200} />
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Publishing…" : "Publish logo"}
          </button>
        </>
      )}
    </form>
  );
}
