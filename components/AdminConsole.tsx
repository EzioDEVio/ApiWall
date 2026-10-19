"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { asset, REPO, REPO_URL, STATIC_MODE } from "@/lib/site";
import { type BrowserCatalog, fromBrowserCatalog } from "@/lib/catalog/browser";
import type { CatalogSnapshot } from "@/lib/catalog/types";
import { AUTH_VALUES, TRI_VALUES } from "@/lib/catalog/requests";
import { createGitHub, type GhCollaborator, type GhIssue, type GitHubClient } from "@/lib/github";
import { FORMS, attachmentUrl, formAuth, formTri, parseForm, requestKind, type RequestKind } from "@/lib/requests/forms";
import { approvalComment, type Approval, ApprovalSchema, canApprove, canTriage, ROLE_INFO, type Role, roleOf } from "@/lib/requests/approval";
import { apiCategories, checkAgainstCatalog, matchCategory } from "@/lib/requests/apply";

type Session = { gh: GitHubClient; login: string; role: Role; roleName: string };
type Draft = Record<string, string>;

const KIND_TAG: Record<RequestKind, string> = { "add-api": "New API", provider: "Provider", logo: "Logo", listing: "Correction" };
const STATUS_LABELS = ["approved", "needs-info", "rejected"];

/** Fields the reviewer can edit for each kind, each prefilled from the form on its own (so one bad field never blanks the rest). */
function initialDraft(kind: RequestKind, form: Record<string, string>, snap: CatalogSnapshot): Draft {
  if (kind === "add-api" || kind === "provider") {
    return {
      name: (form.name ?? "").trim(),
      url: (form.docs ?? "").trim(),
      categorySlug: matchCategory(form.category ?? "", snap) ?? "",
      description: (form.description ?? "").replace(/\s+/g, " ").trim(),
      auth: formAuth(form.auth ?? ""),
      https: formTri(form.https ?? ""),
      cors: formTri(form.cors ?? ""),
      ...(kind === "provider" ? { providerName: (form.providerName ?? "").trim() } : {}),
    };
  }
  if (kind === "logo") return { listingId: (form.listing ?? "").trim(), imageUrl: attachmentUrl(form.logo ?? "") ?? "", sourceUrl: (form.source ?? "").trim() };
  const shutDown = /shut down/i.test(form.problem ?? "");
  return {
    listingId: (form.listing ?? "").trim(),
    action: shutDown ? "hide" : "update",
    reason: "",
    url: "",
    description: "",
    categorySlug: "",
    auth: "",
    https: "",
    cors: "",
  };
}

/** The approval the draft describes (empty correction fields mean "leave as is"). */
function draftToApproval(kind: RequestKind, d: Draft): unknown {
  if (kind !== "listing") return { kind, ...d };
  const out: Record<string, string> = { kind, listingId: d.listingId ?? "", action: d.action ?? "update" };
  if (d.reason?.trim()) out.reason = d.reason.trim();
  if (d.action === "update") for (const k of ["url", "description", "categorySlug", "auth", "https", "cors"]) if (d[k]?.trim()) out[k] = d[k]!.trim();
  return out;
}

export function AdminConsole() {
  const [snap, setSnap] = useState<CatalogSnapshot | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [token, setToken] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<GhIssue[] | null>(null);
  const [filter, setFilter] = useState<RequestKind | "">("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [people, setPeople] = useState<GhCollaborator[] | null | undefined>(undefined);

  useEffect(() => {
    fetch(STATIC_MODE ? asset("/catalog.json") : "/api/catalog")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((c: BrowserCatalog | CatalogSnapshot) => setSnap(fromBrowserCatalog(c)))
      .catch(() => setError("The catalog could not be loaded, so requests cannot be checked against it. Reload to try again."));
  }, []);

  const load = useCallback(async (s: Session) => {
    try {
      setIssues(await s.gh.openIssues());
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = token.trim();
    if (!t) return;
    setSigningIn(true);
    setError(null);
    try {
      const gh = createGitHub(t);
      const { login } = await gh.me();
      const roleName = await gh.roleName(login);
      const s: Session = { gh, login, roleName, role: roleOf(roleName) };
      setSession(s);
      setToken(""); // the client keeps it; the input does not
      await load(s);
      if (s.role === "admin") setPeople(await gh.collaborators());
    } catch (err) {
      setError(`Sign-in failed. ${(err as Error).message}. Check that the token is valid and has access to ${REPO}.`);
    } finally {
      setSigningIn(false);
    }
  };
  const signOut = () => {
    setSession(null);
    setIssues(null);
    setPeople(undefined);
    setOpenId(null);
    setNotice("Signed out. The token is gone from this page.");
  };

  const requests = useMemo(
    () =>
      (issues ?? [])
        .map((i) => ({ issue: i, kind: requestKind(i.labels.map((l) => l.name)) }))
        .filter((r): r is { issue: GhIssue; kind: RequestKind } => r.kind !== null)
        .filter((r) => !filter || r.kind === filter),
    [issues, filter],
  );

  return (
    <div className="admin" data-testid="admin">
      {!session ? (
        <form className="admin-signin" onSubmit={signIn} data-testid="admin-signin">
          <h2>Sign in with a GitHub token</h2>
          <p>
            Requests live as issues in <a href={`${REPO_URL}/issues`}>{REPO}</a>, and GitHub decides what you may do with them, based on your role on the
            repository. Create a{" "}
            <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">
              fine-grained token
            </a>{" "}
            with <strong>Resource owner: EzioDEVio</strong>, <strong>Only select repositories: ApiWall</strong>, and the repository permissions{" "}
            <strong>Issues: Read and write</strong> (Metadata: Read is added automatically). Give it a short expiry.
          </p>
          <label className="field">
            <span>Token</span>
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="github_pat_…"
              required
            />
          </label>
          <p className="muted small">
            The token is kept only in this page&apos;s memory and sent only to api.github.com. It is never saved; reloading or closing the page signs you out.
          </p>
          <button type="submit" className="btn btn-primary" disabled={signingIn || !token.trim()}>
            {signingIn ? "Signing in…" : "Sign in"}
          </button>
        </form>
      ) : (
        <div className="admin-bar glass" data-testid="admin-session">
          <span>
            Signed in as <strong>@{session.login}</strong> · Role: <strong data-testid="admin-role">{roleTitle(session.role)}</strong>{" "}
            <span className="muted small">(GitHub: {session.roleName})</span>
          </span>
          <span className="row">
            <button type="button" className="btn btn-small" onClick={() => load(session)}>
              Refresh
            </button>
            <button type="button" className="btn btn-small btn-quiet" onClick={signOut}>
              Sign out
            </button>
          </span>
        </div>
      )}

      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="admin-notice" role="status">
          {notice}
        </p>
      )}

      {session && (
        <>
          {session.role === "viewer" && (
            <p className="admin-notice" role="note">
              You can see the queue, but your account has no role on {REPO} that allows acting on it. Ask an admin for the Triage or Write role.
            </p>
          )}
          <div className="admin-filters" role="group" aria-label="Show requests">
            {(["", "add-api", "provider", "logo", "listing"] as const).map((k) => (
              <button key={k || "all"} type="button" className="chip-btn" aria-pressed={filter === k} onClick={() => setFilter(k)}>
                {k ? KIND_TAG[k] : "All"}
              </button>
            ))}
          </div>
          {issues === null ? (
            <p className="muted">Loading requests…</p>
          ) : requests.length === 0 ? (
            <p className="muted" data-testid="admin-empty">
              No open requests{filter ? ` of this kind` : ""}. New ones arrive through the forms on the Submit page.
            </p>
          ) : (
            <ul className="admin-queue" data-testid="admin-queue">
              {requests.map(({ issue, kind }) => (
                <RequestCard
                  key={issue.number}
                  issue={issue}
                  kind={kind}
                  snap={snap}
                  session={session}
                  open={openId === issue.number}
                  onToggle={() => setOpenId((v) => (v === issue.number ? null : issue.number))}
                  onDone={(msg) => {
                    setNotice(msg);
                    setOpenId(null);
                    void load(session);
                  }}
                  onError={setError}
                />
              ))}
            </ul>
          )}
          <RolesPanel role={session.role} people={people} />
        </>
      )}
    </div>
  );
}

function roleTitle(r: Role) {
  return r === "admin" ? "Admin" : r === "reviewer" ? "Reviewer" : r === "triage" ? "Triage" : "Viewer";
}

function RequestCard({
  issue,
  kind,
  snap,
  session,
  open,
  onToggle,
  onDone,
  onError,
}: {
  issue: GhIssue;
  kind: RequestKind;
  snap: CatalogSnapshot | null;
  session: Session;
  open: boolean;
  onToggle: () => void;
  onDone: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const form = useMemo(() => parseForm(kind, issue.body), [kind, issue.body]);
  const status = issue.labels.map((l) => l.name).filter((n) => STATUS_LABELS.includes(n));
  return (
    <li className="admin-card" data-testid="admin-request" data-kind={kind}>
      <button type="button" className="admin-card-head" aria-expanded={open} onClick={onToggle}>
        <span className={`tag admin-kind-${kind}`}>{KIND_TAG[kind]}</span>
        <span className="admin-card-title">{issue.title}</span>
        <span className="muted small">
          #{issue.number} · @{issue.user?.login ?? "unknown"} · {issue.created_at.slice(0, 10)}
        </span>
        {status.map((s) => (
          <span key={s} className="tag">
            {s}
          </span>
        ))}
      </button>
      {open && snap && <RequestReview issue={issue} kind={kind} form={form} snap={snap} session={session} onDone={onDone} onError={onError} />}
      {open && !snap && <p className="muted">Loading the catalog…</p>}
    </li>
  );
}

function RequestReview({
  issue,
  kind,
  form,
  snap,
  session,
  onDone,
  onError,
}: {
  issue: GhIssue;
  kind: RequestKind;
  form: Record<string, string>;
  snap: CatalogSnapshot;
  session: Session;
  onDone: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => initialDraft(kind, form, snap));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setDraft((d) => ({ ...d, [k]: v }));
  const cats = useMemo(() => apiCategories(snap), [snap]);
  const listing = draft.listingId ? snap.listings.find((l) => l.id === draft.listingId) : undefined;

  const check = useMemo(() => {
    const r = ApprovalSchema.safeParse(draftToApproval(kind, draft));
    if (!r.success) return { approval: null, problems: r.error.issues.map((i) => `${i.path.join(".") || "request"}: ${i.message}`) };
    return { approval: r.data as Approval, problems: checkAgainstCatalog(r.data, snap, null, issue.number) };
  }, [kind, draft, snap, issue.number]);

  const act = async (what: "approve" | "reject" | "info") => {
    setBusy(true);
    try {
      const gh = session.gh;
      if (what === "approve" && check.approval && !check.problems.length) {
        const summary = `✅ **Approved** by @${session.login} on the ApiWall admin page.${note.trim() ? `\n\n${note.trim()}` : ""}`;
        await gh.comment(issue.number, approvalComment(check.approval, summary));
        await gh.removeLabel(issue.number, "needs-info");
        await gh.removeLabel(issue.number, "approved"); // re-adding it starts the workflow again
        await gh.addLabel(issue.number, "approved");
        onDone(`Approved #${issue.number}. The Requests workflow is applying it; a pull request will merge itself once checks pass.`);
      } else if (what === "reject") {
        await gh.comment(issue.number, `❌ **Not added** (reviewed by @${session.login}): ${note.trim()}`);
        await gh.addLabel(issue.number, "rejected");
        onDone(`Rejected #${issue.number}. The issue closes in a moment.`);
      } else if (what === "info") {
        await gh.comment(issue.number, `ℹ️ **More information needed** (@${session.login}): ${note.trim()}`);
        await gh.addLabel(issue.number, "needs-info");
        onDone(`Asked for more information on #${issue.number}.`);
      }
    } catch (e) {
      onError(`That did not go through. ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const approve = canApprove(session.role);
  const triage = canTriage(session.role);
  const uid = `r${issue.number}`;

  return (
    <div className="admin-review">
      <section aria-label="As submitted">
        <h3>As submitted</h3>
        <dl className="admin-submitted">
          {Object.entries(FORMS[kind].fields).map(([id, label]) => (
            <div key={id}>
              <dt>{label}</dt>
              <dd>{form[id] ? <span className="pre">{form[id]}</span> : <span className="muted">(empty)</span>}</dd>
            </div>
          ))}
        </dl>
        <a href={issue.html_url} target="_blank" rel="noopener noreferrer" className="small">
          Open #{issue.number} on GitHub <span aria-hidden="true">↗</span>
        </a>
      </section>

      <section aria-label="What will be published">
        <h3>What will be published</h3>
        {(kind === "add-api" || kind === "provider") && (
          <div className="admin-fields">
            <Field id={`${uid}-name`} label="Name" value={draft.name} onChange={(v) => set("name", v)} />
            <Field id={`${uid}-url`} label="Docs link (https)" value={draft.url} onChange={(v) => set("url", v)} />
            <Select
              id={`${uid}-cat`}
              label="Category"
              value={draft.categorySlug}
              onChange={(v) => set("categorySlug", v)}
              options={[["", "Choose…"], ...cats.map((c) => [c.slug, c.name] as [string, string])]}
            />
            <Field id={`${uid}-desc`} label="Description" value={draft.description} onChange={(v) => set("description", v)} multiline />
            <Select
              id={`${uid}-auth`}
              label="Auth"
              value={draft.auth}
              onChange={(v) => set("auth", v)}
              options={AUTH_VALUES.map((v) => [v, v] as [string, string])}
            />
            <Select
              id={`${uid}-https`}
              label="HTTPS"
              value={draft.https}
              onChange={(v) => set("https", v)}
              options={TRI_VALUES.map((v) => [v, v] as [string, string])}
            />
            <Select
              id={`${uid}-cors`}
              label="CORS"
              value={draft.cors}
              onChange={(v) => set("cors", v)}
              options={TRI_VALUES.map((v) => [v, v] as [string, string])}
            />
            {kind === "provider" && <Field id={`${uid}-prov`} label="Provider" value={draft.providerName} onChange={(v) => set("providerName", v)} />}
          </div>
        )}
        {kind === "logo" && (
          <div className="admin-fields">
            <ListingPicker id={`${uid}-listing`} snap={snap} value={draft.listingId} onChange={(v) => set("listingId", v)} />
            <Field id={`${uid}-src`} label="Where the provider publishes it (https)" value={draft.sourceUrl} onChange={(v) => set("sourceUrl", v)} />
            <p className="small">
              {draft.imageUrl ? (
                <a href={draft.imageUrl} target="_blank" rel="noopener noreferrer">
                  View the uploaded image <span aria-hidden="true">↗</span>
                </a>
              ) : (
                <span className="admin-problem">No image was uploaded to the issue.</span>
              )}{" "}
              <span className="muted">The workflow checks it is a PNG, JPEG or WebP of at most 256 KB.</span>
            </p>
          </div>
        )}
        {kind === "listing" && (
          <div className="admin-fields">
            <ListingPicker id={`${uid}-listing`} snap={snap} value={draft.listingId} onChange={(v) => set("listingId", v)} />
            <fieldset className="admin-radios">
              <legend>Change</legend>
              <label>
                <input type="radio" name={`${uid}-action`} checked={draft.action === "update"} onChange={() => set("action", "update")} /> Correct facts
              </label>
              <label>
                <input type="radio" name={`${uid}-action`} checked={draft.action === "hide"} onChange={() => set("action", "hide")} /> Remove from the wall
              </label>
            </fieldset>
            {draft.action === "hide" ? (
              <Field id={`${uid}-reason`} label="Reason (shown in the pull request)" value={draft.reason} onChange={(v) => set("reason", v)} />
            ) : (
              <>
                <p className="muted small">
                  Fill in only what changes. Current:{" "}
                  {listing
                    ? `${listing.url ?? "no link"} · auth ${listing.raw.auth || "?"} · HTTPS ${listing.raw.https ?? "?"} · CORS ${listing.raw.cors ?? "?"}`
                    : "choose a listing"}
                </p>
                <Field id={`${uid}-curl`} label="New docs link (https)" value={draft.url} onChange={(v) => set("url", v)} />
                <Field id={`${uid}-cdesc`} label="New description" value={draft.description} onChange={(v) => set("description", v)} multiline />
                <Select
                  id={`${uid}-ccat`}
                  label="New category"
                  value={draft.categorySlug}
                  onChange={(v) => set("categorySlug", v)}
                  options={[["", "Keep"], ...cats.map((c) => [c.slug, c.name] as [string, string])]}
                />
                <Select
                  id={`${uid}-cauth`}
                  label="New auth"
                  value={draft.auth}
                  onChange={(v) => set("auth", v)}
                  options={[["", "Keep"], ...AUTH_VALUES.map((v) => [v, v] as [string, string])]}
                />
                <Select
                  id={`${uid}-chttps`}
                  label="New HTTPS"
                  value={draft.https}
                  onChange={(v) => set("https", v)}
                  options={[["", "Keep"], ...TRI_VALUES.map((v) => [v, v] as [string, string])]}
                />
                <Select
                  id={`${uid}-ccors`}
                  label="New CORS"
                  value={draft.cors}
                  onChange={(v) => set("cors", v)}
                  options={[["", "Keep"], ...TRI_VALUES.map((v) => [v, v] as [string, string])]}
                />
                <Field id={`${uid}-creason`} label="Source or note (optional)" value={draft.reason} onChange={(v) => set("reason", v)} />
              </>
            )}
          </div>
        )}
        {check.problems.length > 0 ? (
          <ul className="admin-problems" data-testid="admin-problems">
            {check.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        ) : (
          <p className="admin-ok" data-testid="admin-ready">
            ✓ Ready to approve.
          </p>
        )}
      </section>

      <section aria-label="Decision" className="admin-decision">
        <Field id={`${uid}-note`} label="Message to the requester (required to reject or ask for info)" value={note} onChange={setNote} multiline />
        <div className="row">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!approve || busy || !check.approval || check.problems.length > 0}
            onClick={() => act("approve")}
            data-testid="admin-approve"
          >
            Approve and publish
          </button>
          <button type="button" className="btn" disabled={!approve || busy || !note.trim()} onClick={() => act("reject")} data-testid="admin-reject">
            Reject
          </button>
          <button type="button" className="btn btn-quiet" disabled={!triage || busy || !note.trim()} onClick={() => act("info")} data-testid="admin-info">
            Ask for more info
          </button>
        </div>
        {!approve && <p className="muted small">Approving and rejecting need the Reviewer role (GitHub Write) or above.</p>}
      </section>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  multiline,
}: {
  id: string;
  label: string;
  value: string | undefined;
  onChange: (v: string) => void;
  multiline?: boolean;
}) {
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      {multiline ? (
        <textarea id={id} rows={3} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value)} spellCheck={false} />
      )}
    </label>
  );
}

function Select({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string | undefined;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <select id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, t]) => (
          <option key={v || "_"} value={v}>
            {t}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Pick a listing by name; the value is its ID. */
function ListingPicker({ id, snap, value, onChange }: { id: string; snap: CatalogSnapshot; value: string | undefined; onChange: (v: string) => void }) {
  const current = snap.listings.find((l) => l.id === value);
  const [q, setQ] = useState(current?.name ?? value ?? "");
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2 || current?.name.toLowerCase() === s) return [];
    return snap.listings.filter((l) => l.name.toLowerCase().includes(s) || l.id === s).slice(0, 8);
  }, [q, snap, current]);
  return (
    <div className="field">
      <label htmlFor={id}>Listing</label>
      <input id={id} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a name" autoComplete="off" spellCheck={false} />
      {current ? (
        <span className="muted small">
          {current.name} · {current.category} · <code>{current.id}</code>
        </span>
      ) : (
        <span className="admin-problem small">No listing chosen.</span>
      )}
      {hits.length > 0 && (
        <ul className="admin-hits">
          {hits.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                className="linkish"
                onClick={() => {
                  onChange(l.id);
                  setQ(l.name);
                }}
              >
                {l.name} <span className="muted small">({l.category})</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RolesPanel({ role, people }: { role: Role; people: GhCollaborator[] | null | undefined }) {
  return (
    <section className="admin-roles" aria-labelledby="roles-h" data-testid="admin-roles">
      <h2 id="roles-h">Roles</h2>
      <p>
        Roles come from each person&apos;s role on <a href={REPO_URL}>{REPO}</a>, given directly or through a team. GitHub enforces them, and the Requests
        workflow checks them again before anything is published.
      </p>
      <table className="admin-table">
        <thead>
          <tr>
            <th scope="col">ApiWall role</th>
            <th scope="col">GitHub repository role</th>
            <th scope="col">Can</th>
          </tr>
        </thead>
        <tbody>
          {ROLE_INFO.map((r) => (
            <tr key={r.role} aria-current={r.role === role ? "true" : undefined}>
              <td>{roleTitle(r.role)}</td>
              <td>{r.github}</td>
              <td>{r.can}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {role === "admin" && (
        <>
          {people && people.length > 0 && (
            <table className="admin-table" data-testid="admin-people">
              <caption>People with access</caption>
              <thead>
                <tr>
                  <th scope="col">Account</th>
                  <th scope="col">Role</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.login}>
                    <td>@{p.login}</td>
                    <td>
                      {roleTitle(roleOf(p.role_name))} <span className="muted small">({p.role_name})</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {people === null && <p className="muted small">Your token could not list people with access. Use the link below to see and change roles.</p>}
          <p className="row">
            <a className="btn" href={`${REPO_URL}/settings/access`} target="_blank" rel="noopener noreferrer">
              Add people or change roles on GitHub <span aria-hidden="true">↗</span>
            </a>
            <a className="btn btn-quiet" href="https://github.com/orgs/EzioDEVio/teams" target="_blank" rel="noopener noreferrer">
              Manage teams <span aria-hidden="true">↗</span>
            </a>
          </p>
        </>
      )}
    </section>
  );
}
