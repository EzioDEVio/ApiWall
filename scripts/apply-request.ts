// Applies one approved request to the repository. Run by .github/workflows/requests.yml after it
// has confirmed that the person who added the "approved" label has the Write role or above.
//
//   ISSUE_JSON=<file> COMMENTS_JSON=<file> APPROVER=<login> OUT_DIR=<dir> tsx scripts/apply-request.ts
//
// Reads the approval comment that person wrote on the issue (or, for new APIs, providers and logos,
// the form as submitted), validates it again, checks it against the catalog, then edits the data
// files and rebuilds the snapshot. Writes OUT_DIR/title.txt and OUT_DIR/body.md for the pull request,
// or OUT_DIR/error.txt with a plain-language reason (and exits 1) when the request cannot be applied.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { readApproval, type Approval } from "../lib/requests/approval";
import { parseForm, requestKind } from "../lib/requests/forms";
import { applyToFiles, checkAgainstCatalog, defaultApproval, describeApproval } from "../lib/requests/apply";
import { EMPTY_COMMUNITY_APIS, EMPTY_OVERRIDES, type CommunityApisFile, type ListingOverridesFile } from "../lib/catalog/requests";
import type { CatalogSnapshot } from "../lib/catalog/types";
import { MAX_LOGO_BYTES } from "../lib/providers/validation";

const root = path.resolve(__dirname, "..");
const outDir = path.resolve(process.env.OUT_DIR || path.join(root, "test-results", "request"));
mkdirSync(outDir, { recursive: true });

function fail(reason: string): never {
  writeFileSync(path.join(outDir, "error.txt"), reason + "\n");
  console.error("✗ " + reason);
  process.exit(1);
}
const readJson = <T>(file: string, fallback: T): T => (existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as T) : fallback);
function writeJson(file: string, value: unknown) {
  const tmp = file + ".tmp";
  writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n");
  renameSync(tmp, file);
}
function run(args: string[]) {
  const r = spawnSync("npx", ["tsx", ...args], { cwd: root, stdio: "inherit" });
  if (r.status !== 0) fail(`The site data could not be rebuilt (${args[0]} failed). A maintainer needs to look at the workflow run.`);
}

interface Issue {
  number: number;
  state: string;
  body: string | null;
  labels: { name: string }[];
}
interface Comment {
  body: string;
  user: { login: string };
  created_at: string;
}

async function main() {
  const issue = JSON.parse(readFileSync(process.env.ISSUE_JSON!, "utf8")) as Issue;
  const comments = JSON.parse(readFileSync(process.env.COMMENTS_JSON!, "utf8")) as Comment[];
  const approver = process.env.APPROVER ?? "";
  if (!/^[A-Za-z0-9-]{1,39}$/.test(approver)) fail("The approver could not be identified.");
  const kind = requestKind(issue.labels.map((l) => l.name));
  if (!kind) fail("This issue is not a request (it has none of the labels add-api, provider, logo or listing).");

  const snapPath = path.join(root, "data", "catalog.snapshot.json");
  const snap = JSON.parse(readFileSync(snapPath, "utf8")) as CatalogSnapshot;

  // The newest approval comment by the person who approved; otherwise the form as submitted.
  const mine = comments
    .filter((c) => c.user.login === approver && c.body.includes("apiwall-approval:v1"))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  let approval: Approval;
  if (mine.length) {
    const r = readApproval(mine[0]!.body);
    if (!r.ok) fail(`The approval comment could not be used: ${r.error}.`);
    approval = r.approval;
  } else {
    const d = defaultApproval(kind!, parseForm(kind!, issue.body), snap);
    if (!d.approval) fail(`The request as submitted cannot be applied (${d.error}). Approve it from the admin page and fix the fields there.`);
    approval = d.approval;
  }
  if (approval.kind !== kind) fail(`The approval is for a ${approval.kind} request, but this issue is a ${kind} request.`);

  const communityPath = path.join(root, "data", "community-apis.json");
  const overridesPath = path.join(root, "data", "listing-overrides.json");
  const communityApis = readJson<CommunityApisFile>(communityPath, EMPTY_COMMUNITY_APIS);
  const overrides = readJson<ListingOverridesFile>(overridesPath, EMPTY_OVERRIDES);
  const problems = checkAgainstCatalog(approval, snap, communityApis, issue.number);
  if (problems.length) fail(`Not applied: ${problems.join("; ")}.`);

  const meta = { issue: issue.number, approvedBy: approver, approvedAt: new Date().toISOString().slice(0, 10) };
  if (approval.kind === "logo") {
    // Only GitHub's own attachment links pass validation; the file is checked again by logos:add.
    const res = await fetch(approval.imageUrl, { redirect: "follow", signal: AbortSignal.timeout(20000) });
    if (!res.ok) fail(`The logo image could not be downloaded (HTTP ${res.status}).`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > MAX_LOGO_BYTES) fail(`The logo image is ${Math.round(bytes.length / 1024)} KB; the limit is 256 KB.`);
    const tmp = path.join(outDir, "logo.bin");
    writeFileSync(tmp, bytes);
    run(["scripts/community-logos.ts", "add", approval.listingId, tmp, approval.sourceUrl, "--note", `Approved by @${approver} in request #${issue.number}`]);
    rmSync(tmp, { force: true });
  } else {
    const next = applyToFiles(approval, meta, { communityApis, overrides });
    writeJson(communityPath, next.communityApis);
    writeJson(overridesPath, next.overrides);
    run(["scripts/import-catalog.ts", "--offline"]);
  }

  const after = JSON.parse(readFileSync(snapPath, "utf8")) as CatalogSnapshot;
  const pr = describeApproval(approval, meta, approval.kind === "listing" ? snap : after);
  writeFileSync(path.join(outDir, "title.txt"), pr.title + "\n");
  writeFileSync(path.join(outDir, "body.md"), pr.body + "\n");
  console.log(`✓ ${pr.title}`);
}

main().catch((e: Error) => fail(`Unexpected error: ${e.message}`));
