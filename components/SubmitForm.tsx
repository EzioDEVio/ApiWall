"use client";

import { cloneElement, useEffect, useRef, useState } from "react";

interface Props {
  categories: string[];
}

type Status = { state: "idle" } | { state: "sending" } | { state: "done"; id: string } | { state: "error"; message: string; fields: Record<string, string> };

export function SubmitForm({ categories }: Props) {
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const [request, setRequest] = useState("listing");
  const started = useRef<number>(0);
  const summaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    started.current = Date.now();
  }, []);

  const fields = status.state === "error" ? status.fields : {};
  const err = (name: string) =>
    fields[name] ? (
      <span className="field-error" id={`${name}-err`}>
        {fields[name]}
      </span>
    ) : null;
  const describedBy = (name: string, hint?: string) => [hint, fields[name] ? `${name}-err` : null].filter(Boolean).join(" ") || undefined;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("startedAt", String(started.current));
    setStatus({ state: "sending" });
    try {
      const res = await fetch("/api/submissions", { method: "POST", body: fd });
      const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string; fields?: Record<string, string> };
      if (res.status === 201 && body.id) {
        setStatus({ state: "done", id: body.id });
        window.scrollTo({ top: 0 });
        return;
      }
      setStatus({ state: "error", message: body.error ?? `The submission failed (HTTP ${res.status}).`, fields: body.fields ?? {} });
    } catch {
      setStatus({ state: "error", message: "The submission could not be sent. Check your connection and try again.", fields: {} });
    }
    requestAnimationFrame(() => summaryRef.current?.focus());
  }

  if (status.state === "done") {
    return (
      <div className="state-panel state-done" role="status" data-testid="submission-confirmation">
        <h2>Submission received</h2>
        <p>
          Reference <code>{status.id}</code>. It is <strong>pending review</strong> and is not public. A reviewer will check your claims against the sources you gave and
          contact you at the address on your domain. Nothing appears on the map until it is approved.
        </p>
        <button type="button" className="btn" onClick={() => setStatus({ state: "idle" })}>
          Submit another API
        </button>
      </div>
    );
  }

  return (
    <form className="submit-form" onSubmit={onSubmit} noValidate encType="multipart/form-data">
      <div className="key-warning big" role="note">
        <strong>Never submit a secret here.</strong> We will contact verified providers about secure setup. Do not paste API keys, tokens, passwords or private keys
        into any field. Submissions that look like they contain one are refused and nothing is saved.
      </div>

      {status.state === "error" && (
        <div className="form-summary" role="alert" tabIndex={-1} ref={summaryRef}>
          <p>
            <strong>{status.message}</strong>
          </p>
          {Object.keys(status.fields).length > 0 && (
            <ul>
              {Object.entries(status.fields).map(([k, v]) => (
                <li key={k}>
                  <a href={`#${k}`}>{v}</a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Honeypot: hidden from people and assistive tech; bots tend to fill it. */}
      <div className="hp" aria-hidden="true">
        <label htmlFor="company_fax">Company fax</label>
        <input id="company_fax" name="company_fax" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <fieldset>
        <legend>What are you requesting?</legend>
        <div className="radio-row">
          {[
            ["listing", "Directory listing", "A reviewed tile and card for your API."],
            ["sponsored-tile", "Sponsored tile", "A clearly labelled sponsored tile. No payment is taken through this site."],
            ["provider-demo", "Provider-funded demo", "Apply for a future in-site demo. Demos stay off until secure setup is agreed."],
          ].map(([v, label, hint]) => (
            <label key={v} className="radio">
              <input type="radio" name="request" value={v} checked={request === v} onChange={() => setRequest(v!)} />
              <span>
                <strong>{label}</strong>
                <small>{hint}</small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>About the API</legend>
        <div className="grid2">
          <Field id="providerName" label="Provider name" err={err} describedBy={describedBy}>
            <input id="providerName" name="providerName" required maxLength={80} autoComplete="organization" />
          </Field>
          <Field id="apiName" label="API name" err={err} describedBy={describedBy}>
            <input id="apiName" name="apiName" required maxLength={80} />
          </Field>
          <Field id="website" label="Official website" hint="https:// only" err={err} describedBy={describedBy}>
            <input id="website" name="website" type="url" required placeholder="https://example.com" inputMode="url" />
          </Field>
          <Field id="docsUrl" label="Documentation URL" err={err} describedBy={describedBy}>
            <input id="docsUrl" name="docsUrl" type="url" required placeholder="https://example.com/docs" inputMode="url" />
          </Field>
          <Field id="category" label="Category" err={err} describedBy={describedBy}>
            <select id="category" name="category" required defaultValue="">
              <option value="" disabled>
                Choose a category
              </option>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
              <option>Other</option>
            </select>
          </Field>
          <Field id="contactEmail" label="Contact email on your domain" hint="Must match the website's domain. Never shown publicly." err={err} describedBy={describedBy}>
            <input id="contactEmail" name="contactEmail" type="email" required autoComplete="email" />
          </Field>
        </div>
        <Field id="description" label="Short description" hint="20–280 characters, plain text" err={err} describedBy={describedBy}>
          <textarea id="description" name="description" required minLength={20} maxLength={280} rows={3} />
        </Field>
        <Field id="catalogListingId" label="Already in the catalog? Listing ID (optional)" hint="Open your tile on the map and copy the ID from the address bar (?api=…). Claims attach to that entry without changing its catalog facts." err={err} describedBy={describedBy}>
          <input id="catalogListingId" name="catalogListingId" pattern="(api|mcp)-[a-z0-9-]+" placeholder="api-example-1a2b3c4d5e" />
        </Field>
      </fieldset>

      <fieldset>
        <legend>Logo for review</legend>
        <p className="muted small">Logos are checked by a reviewer before use and are never loaded from your server. PNG, JPEG or WebP, up to 256 KB.</p>
        <div className="grid2">
          <Field id="logoFile" label="Upload a logo file" err={err} describedBy={describedBy}>
            <input id="logoFile" name="logoFile" type="file" accept="image/png,image/jpeg,image/webp" />
          </Field>
          <Field id="logoUrl" label="…or link to your official logo" hint="Brand or press page, https://" err={err} describedBy={describedBy}>
            <input id="logoUrl" name="logoUrl" type="url" placeholder="https://example.com/press" />
          </Field>
        </div>
      </fieldset>

      <fieldset>
        <legend>Technical facts and access terms</legend>
        <div className="grid3">
          <Field id="auth" label="Authentication" err={err} describedBy={describedBy}>
            <select id="auth" name="auth" defaultValue="apiKey">
              <option value="No">None</option>
              <option value="apiKey">API key</option>
              <option value="OAuth">OAuth</option>
              <option value="Other">Other</option>
            </select>
          </Field>
          <Field id="https" label="HTTPS" err={err} describedBy={describedBy}>
            <select id="https" name="https" defaultValue="yes">
              <option value="yes">Yes</option>
              <option value="no">No</option>
              <option value="unknown">Not sure</option>
            </select>
          </Field>
          <Field id="cors" label="CORS" err={err} describedBy={describedBy}>
            <select id="cors" name="cors" defaultValue="unknown">
              <option value="yes">Yes</option>
              <option value="no">No</option>
              <option value="unknown">Not sure</option>
            </select>
          </Field>
        </div>
        <Field id="pricing" label="Free-tier or paid terms" hint="As published by you, e.g. “Free: 1,000 requests/day for non-commercial use; paid plans from $20/month”" err={err} describedBy={describedBy}>
          <textarea id="pricing" name="pricing" required rows={2} maxLength={400} />
        </Field>
        <div className="grid2">
          <Field id="rateLimits" label="Rate limits" err={err} describedBy={describedBy}>
            <input id="rateLimits" name="rateLimits" required maxLength={300} placeholder="e.g. 60 requests/minute" />
          </Field>
          <Field id="claimSourceUrl" label="Source URL for these claims" hint="Your public pricing or terms page" err={err} describedBy={describedBy}>
            <input id="claimSourceUrl" name="claimSourceUrl" type="url" required placeholder="https://example.com/pricing" />
          </Field>
        </div>
      </fieldset>

      {request === "provider-demo" && (
        <fieldset>
          <legend>Demo proposal</legend>
          <p className="muted small">
            In-site demos are not live yet. A demo can only run after explicit authorisation, reviewer approval, verified quotas and a secure server-side setup agreed
            with you. Do not include credentials.
          </p>
          <Field id="demoUseCase" label="Exact use case" err={err} describedBy={describedBy}>
            <textarea id="demoUseCase" name="demoUseCase" rows={2} maxLength={400} />
          </Field>
          <div className="grid2">
            <Field id="demoEndpoints" label="Supported models or endpoints" err={err} describedBy={describedBy}>
              <input id="demoEndpoints" name="demoEndpoints" maxLength={300} />
            </Field>
            <Field id="demoRequestLimits" label="Request limits for visitors" err={err} describedBy={describedBy}>
              <input id="demoRequestLimits" name="demoRequestLimits" maxLength={200} />
            </Field>
            <Field id="demoCostOwner" label="Who pays for usage" err={err} describedBy={describedBy}>
              <input id="demoCostOwner" name="demoCostOwner" maxLength={120} />
            </Field>
            <Field id="demoAbuseContact" label="Abuse-report contact" err={err} describedBy={describedBy}>
              <input id="demoAbuseContact" name="demoAbuseContact" maxLength={160} />
            </Field>
          </div>
          <Field id="demoUserData" label="What user data the demo handles" err={err} describedBy={describedBy}>
            <textarea id="demoUserData" name="demoUserData" rows={2} maxLength={400} />
          </Field>
        </fieldset>
      )}

      <label className="check">
        <input type="checkbox" name="agree" value="yes" required id="agree" aria-describedby={fields.agree ? "agree-err" : undefined} />
        <span>I am authorised to represent this provider, the information is accurate, and I have not included any API key or secret.</span>
      </label>
      {err("agree")}

      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={status.state === "sending"}>
          {status.state === "sending" ? "Sending…" : "Submit for review"}
        </button>
        <p className="muted small">Submissions stay private until a reviewer approves them.</p>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  hint,
  children,
  err,
  describedBy,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactElement<{ "aria-describedby"?: string; "aria-invalid"?: boolean }>;
  err: (n: string) => React.ReactNode;
  describedBy: (n: string, hint?: string) => string | undefined;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const e = err(id);
  return (
    <div className={"field" + (e ? " has-error" : "")}>
      <label htmlFor={id}>{label}</label>
      {hint && (
        <span className="hint" id={hintId}>
          {hint}
        </span>
      )}
      <FieldControl describedBy={describedBy(id, hintId)} invalid={!!e}>
        {children}
      </FieldControl>
      {e}
    </div>
  );
}

function FieldControl({ children, describedBy, invalid }: { children: React.ReactElement<{ "aria-describedby"?: string; "aria-invalid"?: boolean }>; describedBy?: string; invalid: boolean }) {
  // Link every control to its hint and error message.
  return cloneElement(children, { "aria-describedby": describedBy, "aria-invalid": invalid || undefined });
}
