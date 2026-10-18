"use client";

import { useEffect, useRef, useState } from "react";
import { issueUrl, STATIC_MODE } from "@/lib/site";

interface Props {
  listingId: string;
  listingName: string;
  hasLogo: boolean;
  /** Pre-fills the source field with the listing's own site. */
  siteUrl: string | null;
}

type State = { kind: "idle" } | { kind: "open" } | { kind: "sending" } | { kind: "done" } | { kind: "error"; text: string; fields?: Record<string, string> };

/**
 * Lets anyone propose a logo for a catalog listing. The image is checked on the server,
 * kept private, and appears on the map only after a reviewer approves it.
 */
export function LogoSuggest(props: Props) {
  // The static site has no upload endpoint: suggestions go to a pre-filled GitHub issue form.
  if (STATIC_MODE) return <LogoSuggestOnGitHub {...props} />;
  return <LogoSuggestForm {...props} />;
}

function LogoSuggestOnGitHub({ listingId, listingName, hasLogo, siteUrl }: Props) {
  const href = issueUrl("suggest-logo.yml", `Logo: ${listingName}`, { listing: listingId, name: listingName, source: siteUrl?.startsWith("https://") ? siteUrl : "" });
  return (
    <p className="logo-suggest-intro">
      <span className="muted small">{hasLogo ? "Wrong or blurry logo?" : "No logo yet for this API."}</span>{" "}
      <a className="btn btn-small" href={href} target="_blank" rel="noopener noreferrer" data-testid="logo-suggest-github">
        {hasLogo ? "Suggest a better logo on GitHub" : "Suggest a logo on GitHub"} <span aria-hidden="true">↗</span>
      </a>
    </p>
  );
}

function LogoSuggestForm({ listingId, listingName, hasLogo, siteUrl }: Props) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [preview, setPreview] = useState<string | null>(null);
  const started = useRef(0);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  if (state.kind === "done") {
    return (
      <p className="notice" role="status" data-testid="logo-suggest-done">
        Thanks. A reviewer will check the logo against the source you gave. It appears on the map only after approval.
      </p>
    );
  }
  if (state.kind === "idle") {
    return (
      <p className="logo-suggest-intro">
        <span className="muted small">{hasLogo ? "Wrong or blurry logo?" : "No logo yet for this API."}</span>{" "}
        <button
          type="button"
          className="btn btn-small"
          onClick={() => {
            started.current = Date.now();
            setState({ kind: "open" });
          }}
        >
          {hasLogo ? "Suggest a better logo" : "Suggest a logo"}
        </button>
      </p>
    );
  }

  const fields = state.kind === "error" ? (state.fields ?? {}) : {};
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("listingId", listingId);
    fd.set("startedAt", String(started.current));
    setState({ kind: "sending" });
    try {
      const res = await fetch("/api/logo-suggestions", { method: "POST", body: fd });
      const body = (await res.json().catch(() => ({}))) as { error?: string; fields?: Record<string, string> };
      if (!res.ok) return setState({ kind: "error", text: body.error ?? `The suggestion could not be sent (HTTP ${res.status}).`, fields: body.fields });
      setState({ kind: "done" });
    } catch {
      setState({ kind: "error", text: "The suggestion could not be sent. Check your connection and try again." });
    }
  }

  return (
    <form className="logo-suggest" onSubmit={submit} aria-label={`Suggest a logo for ${listingName}`} data-testid="logo-suggest">
      <p className="muted small">
        Upload the provider&apos;s own logo (PNG, JPEG or WebP, square works best, up to 256 KB) and link the page where they publish it. A reviewer checks it
        before it is shown. <strong>Never submit a secret here.</strong>
      </p>
      <div className="logo-suggest-row">
        <label className="field">
          <span>Logo image</span>
          <input
            name="logoFile"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            required
            aria-invalid={!!fields.logoFile}
            aria-describedby={fields.logoFile ? "ls-file-err" : undefined}
            onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              setPreview(f ? URL.createObjectURL(f) : null);
            }}
          />
          {fields.logoFile && (
            <span className="field-error" id="ls-file-err">
              {fields.logoFile}
            </span>
          )}
        </label>
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Preview of the selected logo" width={56} height={56} className="logo-suggest-preview" />
        )}
      </div>
      <label className="field">
        <span>Where the provider publishes this logo (https)</span>
        <input
          name="sourceUrl"
          type="url"
          required
          defaultValue={siteUrl?.startsWith("https://") ? siteUrl : ""}
          placeholder="https://provider.example/press"
          aria-invalid={!!fields.sourceUrl}
          aria-describedby={fields.sourceUrl ? "ls-src-err" : undefined}
        />
        {fields.sourceUrl && (
          <span className="field-error" id="ls-src-err">
            {fields.sourceUrl}
          </span>
        )}
      </label>
      <label className="field">
        <span>Note for the reviewer (optional)</span>
        <input name="note" maxLength={200} />
      </label>
      <div className="hp" aria-hidden="true">
        <label htmlFor={`ls-fax-${listingId}`}>Company fax</label>
        <input id={`ls-fax-${listingId}`} name="company_fax" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      {state.kind === "error" && (
        <p className="field-error" role="alert">
          {state.text}
        </p>
      )}
      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={state.kind === "sending"}>
          {state.kind === "sending" ? "Sending…" : "Send for review"}
        </button>
        <button type="button" className="btn btn-quiet" onClick={() => setState({ kind: "idle" })}>
          Cancel
        </button>
      </div>
    </form>
  );
}
