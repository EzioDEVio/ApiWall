// The weekly sync's report, built only from the committed data files:
//   tsx scripts/sync-report.ts                 refresh README.md's "This week on ApiWall" section
//   tsx scripts/sync-report.ts --out <dir>     also write <dir>/pr-body.md and <dir>/health-issue.md
// Running it twice on the same data changes nothing, so quiet weeks still open no pull request.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readChangelog, readLinkHistory, readSnapshot } from "../lib/catalog/files";
import { healthIssueBody, prBody, readmeSection, replaceSection, summarize } from "../lib/catalog/syncReport";
import { SITE_URL } from "../lib/site";

const root = path.resolve(__dirname, "..");
const snap = readSnapshot(root);
const summary = summarize(snap, readChangelog(root), readLinkHistory(root));

const readmePath = path.join(root, "README.md");
const readme = readFileSync(readmePath, "utf8");
const next = replaceSection(readme, readmeSection(summary, snap, SITE_URL));
if (next !== readme) {
  writeFileSync(readmePath, next);
  console.log("✓ README: refreshed “This week on ApiWall”.");
} else console.log("README: “This week on ApiWall” is already current.");

const outIdx = process.argv.indexOf("--out");
if (outIdx > 0 && process.argv[outIdx + 1]) {
  const dir = path.resolve(process.argv[outIdx + 1]!);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "pr-body.md"), prBody(summary, snap, SITE_URL) + "\n");
  writeFileSync(path.join(dir, "health-issue.md"), healthIssueBody(summary, snap, SITE_URL) + "\n");
  console.log(`✓ Wrote pr-body.md and health-issue.md to ${dir}`);
}
