import { REPO } from "./site";

/**
 * A tiny GitHub REST client for the admin page. The token lives only in the page's memory (never
 * in storage, cookies or URLs) and is sent only to api.github.com. Everything the page does is a
 * normal GitHub action under that person's own account, so GitHub enforces what they may do.
 */
export const GITHUB_API = "https://api.github.com";

export class GitHubError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface GhIssue {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  created_at: string;
  user: { login: string } | null;
  labels: { name: string }[];
  pull_request?: unknown;
}
export interface GhCollaborator {
  login: string;
  role_name: string;
}

export function createGitHub(token: string, fetcher: typeof fetch = (...a) => fetch(...a)) {
  const call = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
    const res = await fetcher(`${GITHUB_API}${path}`, {
      ...init,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "x-github-api-version": "2022-11-28",
        ...(init.body ? { "content-type": "application/json" } : {}),
      },
      referrerPolicy: "no-referrer",
      credentials: "omit",
      cache: "no-store",
    });
    if (!res.ok) {
      let msg = `GitHub answered HTTP ${res.status}`;
      try {
        const j = (await res.json()) as { message?: string };
        if (j.message) msg = `${msg}: ${j.message}`;
      } catch {
        /* not JSON */
      }
      throw new GitHubError(res.status, msg);
    }
    return (res.status === 204 ? null : await res.json()) as T;
  };
  const repo = `/repos/${REPO}`;
  return {
    me: () => call<{ login: string }>("/user"),
    /** The person's role on the repository ("admin", "maintain", "write", "triage", "read"), or "none". */
    roleName: async (login: string) => {
      try {
        return (await call<{ role_name: string }>(`${repo}/collaborators/${encodeURIComponent(login)}/permission`)).role_name;
      } catch (e) {
        if (e instanceof GitHubError && (e.status === 403 || e.status === 404)) return "none";
        throw e;
      }
    },
    /** Open issues (not pull requests), newest first. */
    openIssues: async () => (await call<GhIssue[]>(`${repo}/issues?state=open&per_page=100&sort=created&direction=desc`)).filter((i) => !i.pull_request),
    comment: (issue: number, body: string) => call(`${repo}/issues/${issue}/comments`, { method: "POST", body: JSON.stringify({ body }) }),
    addLabel: (issue: number, label: string) => call(`${repo}/issues/${issue}/labels`, { method: "POST", body: JSON.stringify({ labels: [label] }) }),
    removeLabel: async (issue: number, label: string) => {
      try {
        await call(`${repo}/issues/${issue}/labels/${encodeURIComponent(label)}`, { method: "DELETE" });
      } catch (e) {
        if (!(e instanceof GitHubError && e.status === 404)) throw e;
      }
    },
    /** People with access and their roles; needs push access, so it may be unavailable. */
    collaborators: async (): Promise<GhCollaborator[] | null> => {
      try {
        return await call<GhCollaborator[]>(`${repo}/collaborators?per_page=100`);
      } catch (e) {
        if (e instanceof GitHubError && (e.status === 403 || e.status === 404)) return null;
        throw e;
      }
    },
  };
}
export type GitHubClient = ReturnType<typeof createGitHub>;
