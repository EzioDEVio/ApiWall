// Run by the weekly sync before it opens a pull request. Each import rewrites a few
// "when did this run" timestamps even when the catalog itself did not change. If those
// timestamps are the only differences, this restores the files, so no pull request is opened.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const TIMESTAMP_KEYS = new Set(["importedAt", "updatedAt", "fetchedAt"]);
const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

const strip = (v) => {
  if (Array.isArray(v)) return v.map(strip);
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.entries(v)
        .filter(([k]) => !TIMESTAMP_KEYS.has(k))
        .map(([k, x]) => [k, strip(x)]),
    );
  return v;
};

const changed = git("diff", "--name-only").split("\n").filter(Boolean);
const untracked = git("ls-files", "--others", "--exclude-standard").split("\n").filter(Boolean);

const onlyTimestamps =
  untracked.length === 0 &&
  changed.every((f) => {
    if (!f.endsWith(".json")) return false;
    try {
      const before = JSON.stringify(strip(JSON.parse(git("show", `HEAD:${f}`))));
      const after = JSON.stringify(strip(JSON.parse(readFileSync(f, "utf8"))));
      return before === after;
    } catch {
      return false; // new, deleted or unreadable: a real change
    }
  });

if (changed.length === 0 && untracked.length === 0) console.log("Nothing changed.");
else if (onlyTimestamps) {
  git("checkout", "--", ...changed);
  console.log(`Only timestamps changed in ${changed.join(", ")}. Restored them; no pull request is needed this week.`);
} else console.log(`Real changes found (${changed.length} changed, ${untracked.length} new files). A pull request will be opened.`);
