// Merges routine bot pull requests once every check on them is green. Run by
// .github/workflows/auto-merge.yml after CI or Lighthouse finishes on a pull request.
//
// Merged automatically (and only these):
//   - the weekly catalog sync (github-actions[bot], branch chore/catalog-sync) when it only
//     touches catalog data, logos and the README;
//   - Dependabot updates that stay within the same major version (same minor for 0.x), when
//     they only touch package.json, package-lock.json or workflow files.
// Everything else waits for a person (or the weekly upkeep agent): major updates, human pull
// requests, and anything with a failing, pending or missing check.
//
// This script never checks out or runs code from the pull request; it only reads the GitHub API.

/** Checks that must exist and pass on the pull request's latest commit. */
export const REQUIRED_CHECKS = ["Lint, types, unit tests, builds", "Browser tests", "lighthouse"];

const SYNC_FILES = [/^data\//, /^public\/marks\//, /^README\.md$/];
const DEPENDABOT_FILES = [/^package\.json$/, /^package-lock\.json$/, /^\.github\/workflows\/[^/]+\.ya?ml$/];

/** Every "from X to Y" version change named in a Dependabot pull request body. */
export function dependabotBumps(body) {
  const bumps = [];
  const re = /(?:Updates|Bumps) (?:`([^`]+)`|\[([^\]]+)\]\([^)]*\)) from (\S+?) to (\S+?)(?:\.?\s|\.?$)/gm;
  for (const m of String(body ?? "").matchAll(re)) bumps.push({ name: m[1] ?? m[2], from: m[3], to: m[4] });
  return bumps;
}

const parts = (v) => String(v).replace(/^v/, "").split(/[.+-]/).map((x) => Number.parseInt(x, 10));

/** True when the update stays within the same major version (same minor for 0.x versions). */
export function isSafeBump({ from, to }) {
  const a = parts(from);
  const b = parts(to);
  if ([a[0], b[0]].some((n) => !Number.isFinite(n))) return false;
  if (a[0] !== b[0]) return false;
  if (a[0] === 0 && a[1] !== b[1]) return false;
  return true;
}

/**
 * Decides whether a pull request may be merged. Returns { merge: true } or { merge: false, reason }.
 * `pr` is the GitHub pull request, `files` its changed file names, `checks` the check runs on its head commit,
 * and `behindBy` how many commits main has that the pull request does not (its checks must have seen them).
 */
export function decide(pr, files, checks, behindBy = 0) {
  if (pr.state !== "open" || pr.draft) return { merge: false, reason: "not an open, ready pull request" };
  if (pr.base?.ref !== "main") return { merge: false, reason: "does not target main" };
  const author = pr.user?.login;
  const head = pr.head?.ref ?? "";
  let allowed;
  if (author === "github-actions[bot]" && head === "chore/catalog-sync") allowed = SYNC_FILES;
  else if (author === "dependabot[bot]" && head.startsWith("dependabot/")) {
    const bumps = dependabotBumps(pr.body);
    if (!bumps.length) return { merge: false, reason: "could not read the versions from the Dependabot description" };
    const major = bumps.filter((b) => !isSafeBump(b));
    if (major.length) return { merge: false, reason: `major update needs a person: ${major.map((b) => `${b.name} ${b.from} → ${b.to}`).join(", ")}` };
    allowed = DEPENDABOT_FILES;
  } else return { merge: false, reason: `not a routine bot pull request (${author}, ${head})` };

  const unexpected = files.filter((f) => !allowed.some((re) => re.test(f)));
  if (unexpected.length) return { merge: false, reason: `changes files outside its scope: ${unexpected.slice(0, 5).join(", ")}` };

  const latest = new Map();
  for (const c of checks) {
    const prev = latest.get(c.name);
    if (!prev || String(c.started_at ?? "") > String(prev.started_at ?? "")) latest.set(c.name, c);
  }
  for (const name of REQUIRED_CHECKS) {
    const c = latest.get(name);
    if (!c) return { merge: false, reason: `check "${name}" has not run yet` };
    if (c.status !== "completed") return { merge: false, reason: `check "${name}" is still running` };
    if (c.conclusion !== "success") return { merge: false, reason: `check "${name}" ended ${c.conclusion}` };
  }
  for (const c of latest.values())
    if (c.status === "completed" && !["success", "skipped", "neutral"].includes(c.conclusion))
      return { merge: false, reason: `check "${c.name}" ended ${c.conclusion}` };
  if (pr.mergeable === false) return { merge: false, reason: "has merge conflicts" };
  if (behindBy > 0) return { merge: false, reason: `is ${behindBy} commit(s) behind main, so its checks did not test the current code`, behind: true };
  return { merge: true };
}

async function main() {
  const token = process.env.GH_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  const sha = process.env.HEAD_SHA;
  if (!token || !repo || !/^[0-9a-f]{40}$/.test(sha ?? "")) throw new Error("GH_TOKEN, GITHUB_REPOSITORY and HEAD_SHA are required");
  const api = async (path, init = {}) => {
    const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", ...init.headers },
    });
    if (!res.ok && res.status !== 204) throw new Error(`${init.method ?? "GET"} ${path}: HTTP ${res.status} ${await res.text()}`);
    return res.status === 204 ? null : res.json();
  };

  const prs = (await api(`/commits/${sha}/pulls`)).filter((p) => p.state === "open" && p.head.sha === sha);
  if (!prs.length) return console.log("No open pull request has this commit as its head; nothing to do.");
  for (const listed of prs) {
    let pr = await api(`/pulls/${listed.number}`);
    for (let i = 0; pr.mergeable === null && i < 5; i++) {
      await new Promise((r) => setTimeout(r, 3000)); // GitHub computes mergeability in the background
      pr = await api(`/pulls/${listed.number}`);
    }
    const files = (await api(`/pulls/${pr.number}/files?per_page=100`)).map((f) => f.filename);
    const checks = (await api(`/commits/${sha}/check-runs?per_page=100`)).check_runs;
    const behindBy = (await api(`/compare/main...${sha}`)).behind_by;
    const verdict = decide(pr, files, checks, behindBy);
    if (!verdict.merge) {
      console.log(`#${pr.number} stays open: ${verdict.reason}.`);
      // A stale Dependabot pull request gets rebased; its new checks bring it back here.
      if (verdict.behind && pr.user.login === "dependabot[bot]") {
        const comments = await api(`/issues/${pr.number}/comments?per_page=100`);
        if (!comments.some((c) => c.body.trim() === "@dependabot rebase")) {
          await api(`/issues/${pr.number}/comments`, { method: "POST", body: JSON.stringify({ body: "@dependabot rebase" }) });
          console.log(`Asked Dependabot to rebase #${pr.number}.`);
        }
      }
      continue;
    }
    // `sha` makes GitHub refuse the merge if anything was pushed after these checks ran.
    await api(`/pulls/${pr.number}/merge`, { method: "PUT", body: JSON.stringify({ sha, merge_method: "squash" }) });
    console.log(`Merged #${pr.number}: ${pr.title}`);
    try {
      await api(`/git/refs/heads/${encodeURIComponent(pr.head.ref).replace(/%2F/g, "/")}`, { method: "DELETE" });
    } catch (e) {
      console.log(`Branch ${pr.head.ref} was not deleted (${e.message.split(":")[0]}).`);
    }
    // Merges made with the workflow token do not start other workflows, so start the deploy here.
    await api(`/actions/workflows/pages.yml/dispatches`, { method: "POST", body: JSON.stringify({ ref: "main" }) });
    console.log("Started Deploy to GitHub Pages.");
  }
}

if (import.meta.url === `file://${process.argv[1]}`)
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
