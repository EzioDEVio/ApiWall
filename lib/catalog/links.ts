/**
 * Docs-link health, refreshed by the weekly sync (scripts/check-links.ts). Only listings whose
 * docs link failed are stored, with the date it first failed, so the file stays small and only
 * changes when a link breaks or recovers.
 */
export interface UnreachableLink {
  /** When the link first failed (kept while it keeps failing). */
  since: string;
  /** Short, human-readable cause: "HTTP 404", "domain not found", "timed out", … */
  reason: string;
}

export interface LinkHealth {
  version: 1;
  /** When the last full check ran (null before the first one). */
  checkedAt: string | null;
  /** How many distinct links that check visited. */
  checked: number;
  unreachable: Record<string, UnreachableLink>;
}

export const EMPTY_LINK_HEALTH: LinkHealth = { version: 1, checkedAt: null, checked: 0, unreachable: {} };

export type LinkState =
  { state: "unchecked" } | { state: "reachable"; checkedAt: string } | { state: "unreachable"; checkedAt: string; since: string; reason: string };

/** What the site says about one listing's docs link. */
export function linkState(health: LinkHealth | undefined, id: string, hasUrl: boolean): LinkState {
  if (!health?.checkedAt || !hasUrl) return { state: "unchecked" };
  const u = health.unreachable[id];
  return u ? { state: "unreachable", checkedAt: health.checkedAt, since: u.since, reason: u.reason } : { state: "reachable", checkedAt: health.checkedAt };
}

/** Result of visiting one URL. `ok` means the server answered in a way that shows the page exists. */
export interface Probe {
  ok: boolean;
  reason: string;
}

/**
 * Turns an HTTP status into reachable / unreachable. Only answers that really mean "gone" or
 * "broken" count as unreachable: 401, 403 and 429 come from live servers that turn away
 * robots, so they are treated as reachable.
 */
export function classifyStatus(status: number): Probe {
  if (status === 404 || status === 410) return { ok: false, reason: `page not found (HTTP ${status})` };
  if (status >= 500 && status <= 599) return { ok: false, reason: `server error (HTTP ${status})` };
  return { ok: true, reason: `HTTP ${status}` };
}

/** Turns a network error (as thrown by fetch) into a short reason. */
export function classifyError(err: unknown): Probe {
  const e = err as { name?: string; message?: string; cause?: { code?: string; message?: string } };
  const code = e?.cause?.code ?? "";
  if (e?.name === "TimeoutError" || e?.name === "AbortError" || code === "UND_ERR_CONNECT_TIMEOUT" || code === "UND_ERR_HEADERS_TIMEOUT")
    return { ok: false, reason: "timed out" };
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return { ok: false, reason: "domain not found" };
  if (code === "ECONNREFUSED") return { ok: false, reason: "connection refused" };
  if (code === "ECONNRESET" || code === "UND_ERR_SOCKET") return { ok: false, reason: "connection dropped" };
  if (/CERT|SSL|TLS/i.test(code) || /certificate/i.test(e?.cause?.message ?? "")) return { ok: false, reason: "security certificate problem" };
  return { ok: false, reason: "could not connect" };
}

/**
 * Next health file from this run's failures. Links that keep failing keep their first `since`;
 * links that work again are dropped.
 */
export function mergeHealth(previous: LinkHealth, failures: Map<string, string>, checked: number, now: string): LinkHealth {
  const unreachable: Record<string, UnreachableLink> = {};
  for (const id of [...failures.keys()].sort()) unreachable[id] = { since: previous.unreachable[id]?.since ?? now, reason: failures.get(id)! };
  return { version: 1, checkedAt: now, checked, unreachable };
}

export type Fetcher = (
  url: string,
  init: { method: "HEAD" | "GET"; signal: AbortSignal; redirect: "follow"; headers: Record<string, string> },
) => Promise<{ status: number; body?: { cancel?: () => unknown } | null }>;

export const USER_AGENT = "ApiWallLinkCheck/1.0 (+https://github.com/EzioDEVio/ApiWall; weekly docs-link check)";

/** Visits one URL: HEAD first (cheap), then GET when a server rejects HEAD or HEAD fails. */
export async function probeUrl(url: string, fetcher: Fetcher, timeoutMs = 12_000): Promise<Probe> {
  const attempt = async (method: "HEAD" | "GET"): Promise<Probe> => {
    try {
      const res = await fetcher(url, {
        method,
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "user-agent": USER_AGENT, accept: "text/html,application/json;q=0.9,*/*;q=0.8" },
      });
      try {
        await res.body?.cancel?.(); // never download page bodies
      } catch {
        /* already closed */
      }
      return classifyStatus(res.status);
    } catch (err) {
      return classifyError(err);
    }
  };
  const head = await attempt("HEAD");
  return head.ok ? head : attempt("GET");
}

export interface CheckResult {
  /** Listing ID → reason, for links that failed twice. */
  failures: Map<string, string>;
  /** Distinct URLs visited. */
  checked: number;
}

/**
 * Checks every listing's link. Hosts are visited one URL at a time (several hosts in
 * parallel), so no single site gets a burst of requests. Anything that fails is tried again
 * after `retryDelayMs`; only links that fail both times are reported.
 */
export async function checkLinks(
  targets: { id: string; url: string }[],
  probe: (url: string) => Promise<Probe>,
  opts: { concurrency?: number; retryDelayMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<CheckResult> {
  const concurrency = opts.concurrency ?? 16;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const idsByUrl = new Map<string, string[]>();
  for (const t of targets) idsByUrl.set(t.url, [...(idsByUrl.get(t.url) ?? []), t.id]);
  const hostOf = (u: string) => {
    try {
      return new URL(u).hostname;
    } catch {
      return u;
    }
  };

  const run = async (urls: string[]) => {
    const byHost = new Map<string, string[]>();
    for (const u of urls) byHost.set(hostOf(u), [...(byHost.get(hostOf(u)) ?? []), u]);
    const queues = [...byHost.values()];
    const failed = new Map<string, string>();
    let next = 0;
    const worker = async () => {
      while (next < queues.length) {
        const q = queues[next++]!;
        for (const u of q) {
          const r = await probe(u);
          if (!r.ok) failed.set(u, r.reason);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, queues.length) }, worker));
    return failed;
  };

  const urls = [...idsByUrl.keys()];
  const first = await run(urls);
  let second = new Map<string, string>();
  if (first.size) {
    await sleep(opts.retryDelayMs ?? 30_000);
    second = await run([...first.keys()]);
  }
  const failures = new Map<string, string>();
  for (const [u, reason] of second) for (const id of idsByUrl.get(u) ?? []) failures.set(id, reason);
  return { failures, checked: urls.length };
}
