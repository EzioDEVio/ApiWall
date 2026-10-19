import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain ES module script without type declarations
import { decide, dependabotBumps, isSafeBump, REQUIRED_CHECKS } from "../../scripts/auto-merge.mjs";

const green = (REQUIRED_CHECKS as string[]).map((name) => ({ name, status: "completed", conclusion: "success", started_at: "2026-10-19T10:00:00Z" }));
const sync = { state: "open", draft: false, base: { ref: "main" }, user: { login: "github-actions[bot]" }, head: { ref: "chore/catalog-sync" }, mergeable: true, body: "" };
const bot = (body: string) => ({ ...sync, user: { login: "dependabot[bot]" }, head: { ref: "dependabot/npm_and_yarn/x" }, body });
const syncFiles = ["data/catalog.snapshot.json", "data/upstream/README.md", "public/marks/tiles/x.webp", "README.md"];

describe("auto-merge rules", () => {
  it("merges the weekly sync when it only touches data, logos and the README and every check passed", () => {
    expect(decide(sync, syncFiles, green)).toEqual({ merge: true });
  });
  it("never merges with a failing, running or missing check", () => {
    expect(decide(sync, syncFiles, green.map((c, i) => (i === 1 ? { ...c, conclusion: "failure" } : c))).merge).toBe(false);
    expect(decide(sync, syncFiles, green.map((c, i) => (i === 0 ? { ...c, status: "in_progress", conclusion: null } : c))).merge).toBe(false);
    expect(decide(sync, syncFiles, green.slice(1))).toEqual({ merge: false, reason: 'check "Lint, types, unit tests, builds" has not run yet' });
    expect(decide(sync, syncFiles, [...green, { name: "extra", status: "completed", conclusion: "failure" }]).merge).toBe(false);
  });
  it("waits when main has moved on since the checks ran", () => {
    expect(decide(sync, syncFiles, green, 3)).toMatchObject({ merge: false, behind: true });
  });
  it("judges a re-run by its latest result", () => {
    const rerun = [...green.map((c) => ({ ...c, conclusion: "failure", started_at: "2026-10-19T09:00:00Z" })), ...green];
    expect(decide(sync, syncFiles, rerun)).toEqual({ merge: true });
  });
  it("refuses a sync that touches code, or any pull request from a person", () => {
    expect(decide(sync, [...syncFiles, "scripts/import-catalog.ts"], green).merge).toBe(false);
    expect(decide({ ...sync, user: { login: "someone" } }, syncFiles, green).merge).toBe(false);
    expect(decide({ ...sync, head: { ref: "chore/catalog-sync-evil" } }, syncFiles, green).merge).toBe(false);
    expect(decide({ ...sync, mergeable: false }, syncFiles, green).merge).toBe(false);
    expect(decide({ ...sync, base: { ref: "other" } }, syncFiles, green).merge).toBe(false);
  });
  it("reads Dependabot's version changes, single and grouped", () => {
    expect(dependabotBumps("Bumps [@vitejs/plugin-react](https://x) from 4.7.0 to 6.1.2.")).toEqual([{ name: "@vitejs/plugin-react", from: "4.7.0", to: "6.1.2" }]);
    expect(dependabotBumps("Updates `@playwright/test` from 1.58.2 to 1.64.1\nUpdates `react` from 19.1.10 to 19.3.1\n")).toEqual([
      { name: "@playwright/test", from: "1.58.2", to: "1.64.1" },
      { name: "react", from: "19.1.10", to: "19.3.1" },
    ]);
  });
  it("merges minor and patch updates but leaves major ones for a person", () => {
    expect(isSafeBump({ from: "1.58.2", to: "1.64.1" })).toBe(true);
    expect(isSafeBump({ from: "4.7.0", to: "6.1.2" })).toBe(false);
    expect(isSafeBump({ from: "0.34.5", to: "0.35.5" })).toBe(false); // 0.x minors can break
    expect(isSafeBump({ from: "0.35.5", to: "0.35.6" })).toBe(true);
    const deps = ["package.json", "package-lock.json"];
    expect(decide(bot("Updates `@playwright/test` from 1.58.2 to 1.64.1\n"), deps, green)).toEqual({ merge: true });
    expect(decide(bot("Bumps [next](https://x) from 15.5.27 to 16.4.1."), deps, green).reason).toMatch(/^major update needs a person: next 15\.5\.27 → 16\.4\.1/);
    expect(decide(bot("Updates `a` from 1.0.0 to 1.1.0\nUpdates `b` from 2.0.0 to 3.0.0\n"), deps, green).merge).toBe(false);
    expect(decide(bot("no versions here"), deps, green).merge).toBe(false);
    expect(decide(bot("Updates `a` from 1.0.0 to 1.1.0\n"), [...deps, "app/page.tsx"], green).merge).toBe(false);
  });
});
