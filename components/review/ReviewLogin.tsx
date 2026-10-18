"use client";

import { useState } from "react";

export function ReviewLogin() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const token = String(new FormData(e.currentTarget).get("token") ?? "");
    const res = await fetch("/api/review/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
    setBusy(false);
    if (res.ok) {
      window.location.reload();
      return;
    }
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    setError(body.error ?? "Sign-in failed.");
  }

  return (
    <div className="page narrow">
      <h1>Reviewer sign-in</h1>
      <p className="lede">Only reviewers can see pending submissions.</p>
      <form className="submit-form" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="token">Reviewer token</label>
          <input id="token" name="token" type="password" required autoComplete="current-password" minLength={16} />
        </div>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Checking…" : "Sign in"}
          </button>
        </div>
      </form>
    </div>
  );
}
