import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildPacks, PACKS } from "@/lib/catalog/packs";
import { EMPTY_LINK_HISTORY, linkSpans, recordRun, type LinkHistory } from "@/lib/catalog/linkHistory";
import { computeStats, pct } from "@/lib/catalog/stats";
import { buildPublicApi } from "@/lib/catalog/publicApi";
import { healthIssueBody, mdText, prBody, README_END, README_START, readmeSection, replaceSection, summarize } from "@/lib/catalog/syncReport";
import { readChangelog, readLinkHistory, readSnapshot } from "@/lib/catalog/files";
import { buildEntries, filterEntries, EMPTY_FILTERS, type Entry } from "@/lib/explore/model";
import { parseUrlState } from "@/lib/explore/urlState";
import { toCsv, toJson, toMarkdown } from "@/lib/exportList";
import { inkOn, luminance, tileColor } from "@/lib/explore/colors";
import manifest from "@/app/manifest";
import type { LinkHealth } from "@/lib/catalog/links";

const root = process.cwd();
const snap = readSnapshot(root);
const changelog = readChangelog(root);
const entries = buildEntries(snap, null);
const health = (checkedAt: string, ids: string[], checked = 100): LinkHealth => ({
  version: 1,
  checkedAt,
  checked,
  unreachable: Object.fromEntries(ids.map((id) => [id, { since: checkedAt, reason: "timed out" }])),
});

describe("starter packs", () => {
  const packs = buildPacks(entries);
  it("has unique slugs and a non-empty, sorted list for every pack", () => {
    expect(new Set(PACKS.map((p) => p.slug)).size).toBe(PACKS.length);
    for (const p of packs) {
      expect(p.entries.length, p.slug).toBeGreaterThan(0);
      const names = p.entries.map((e) => e.name);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en")));
    }
  });
  it("only includes APIs that match the pack's own rule", () => {
    const keyless = packs.find((p) => p.slug === "no-key-needed")!;
    for (const e of keyless.entries) {
      expect(e.auth).toBe("none");
      expect(e.https).toBe("yes");
      expect(e.link.state).not.toBe("unreachable");
    }
    expect(packs.find((p) => p.slug === "browser-ready")!.entries.every((e) => e.cors === "yes")).toBe(true);
    expect(packs.find((p) => p.slug === "mcp-servers")!.entries.every((e) => e.kind === "mcp")).toBe(true);
  });
  it("opens exactly the same set on the wall when the filters can express it", () => {
    for (const p of packs.filter((x) => x.wall.startsWith("/?") && !x.wall.includes("list="))) {
      const { filters } = parseUrlState(p.wall.slice(1));
      const onWall = filterEntries(entries, filters)
        .filter((e) => e.source === "catalog")
        .map((e) => e.id)
        .sort();
      expect(onWall, p.slug).toEqual(p.entries.map((e) => e.id).sort());
    }
  });
  it("falls back to a shared-list link (at most 100 APIs) for packs the filters can't express", () => {
    const fun = packs.find((p) => p.slug === "fun-first-projects")!;
    expect(fun.wall).toMatch(/^\/\?list=/);
    expect(fun.wall.slice(7).split(",").length).toBe(Math.min(100, fun.entries.length));
  });
});

describe("docs-link history", () => {
  it("starts a period only when the set of broken links changes", () => {
    let h: LinkHistory = EMPTY_LINK_HISTORY;
    h = recordRun(h, health("2026-10-05T00:00:00Z", ["a"]));
    h = recordRun(h, health("2026-10-12T00:00:00Z", ["a"]));
    expect(h.periods).toEqual([{ from: "2026-10-05T00:00:00Z", lastCheckedAt: "2026-10-12T00:00:00Z", checked: 100, unreachable: ["a"] }]);
    h = recordRun(h, health("2026-10-19T00:00:00Z", ["b", "a"]));
    expect(h.periods).toHaveLength(2);
    expect(h.periods[1]!.unreachable).toEqual(["a", "b"]);
    // Re-recording the same check (or an older one) changes nothing.
    expect(recordRun(h, health("2026-10-19T00:00:00Z", []))).toBe(h);
    expect(recordRun(h, { ...health("", []), checkedAt: null })).toBe(h);
  });
  it("turns periods into per-API spans", () => {
    let h: LinkHistory = EMPTY_LINK_HISTORY;
    for (const [at, ids] of [
      ["2026-10-05T00:00:00Z", []],
      ["2026-10-12T00:00:00Z", ["a"]],
      ["2026-10-19T00:00:00Z", ["a", "b"]],
      ["2026-10-26T00:00:00Z", ["b"]],
    ] as const)
      h = recordRun(h, health(at, [...ids]));
    expect(linkSpans(h, "a")).toEqual([
      { state: "reachable", from: "2026-10-05T00:00:00Z", to: "2026-10-05T00:00:00Z" },
      { state: "unreachable", from: "2026-10-12T00:00:00Z", to: "2026-10-19T00:00:00Z" },
      { state: "reachable", from: "2026-10-26T00:00:00Z", to: "2026-10-26T00:00:00Z" },
    ]);
    expect(linkSpans(h, "zzz").map((s) => s.state)).toEqual(["reachable"]);
  });
  it("keeps at most two years of periods", () => {
    let h: LinkHistory = EMPTY_LINK_HISTORY;
    for (let i = 0; i < 120; i++) h = recordRun(h, health(new Date(Date.UTC(2026, 0, 1 + i * 7)).toISOString(), [`x${i}`]));
    expect(h.periods).toHaveLength(104);
  });
  it("the committed history agrees with the committed link health", () => {
    const committed = readLinkHistory(root);
    const last = committed.periods[committed.periods.length - 1]!;
    expect(last.unreachable).toEqual(Object.keys(snap.linkHealth!.unreachable).sort());
  });
});

describe("catalog stats", () => {
  const stats = computeStats(entries, snap.categories, readLinkHistory(root), changelog);
  it("adds up", () => {
    expect(stats.apis + stats.mcp).toBe(stats.total);
    expect(Object.values(stats.auth).reduce((a, b) => a + b, 0)).toBe(stats.apis);
    expect(Object.values(stats.https).reduce((a, b) => a + b, 0)).toBe(stats.apis);
    // Only listings still in the catalog count (a removed API can stay in link-health.json until the next check).
    const present = new Set(snap.listings.map((l) => l.id));
    expect(stats.links.unreachable).toBe(Object.keys(snap.linkHealth!.unreachable).filter((id) => present.has(id)).length);
    expect(stats.topCategories.length).toBeLessThanOrEqual(15);
    expect(stats.topCategories.map((c) => c.count)).toEqual([...stats.topCategories.map((c) => c.count)].sort((a, b) => b - a));
  });
  it("rounds percentages and never divides by zero", () => {
    expect(pct(1, 3)).toBe(33);
    expect(pct(5, 0)).toBe(0);
  });
});

describe("public API: packs, stats and badges", () => {
  const files = buildPublicApi(snap, changelog, "https://x.test", readLinkHistory(root));
  it("lists every pack with its APIs", () => {
    const list = files.get("packs.json") as { data: { slug: string; count: number; url: string }[] };
    expect(list.data.map((p) => p.slug)).toEqual(PACKS.map((p) => p.slug));
    for (const p of list.data) {
      const body = files.get(`packs/${p.slug}.json`) as { data: { id: string }[]; pack: { pageUrl: string } };
      expect(body.data).toHaveLength(p.count);
      expect(body.pack.pageUrl).toBe(`https://x.test/packs/${p.slug}/`);
      expect(p.url).toBe(`https://x.test/api/v1/packs/${p.slug}.json`);
    }
  });
  it("serves shields.io endpoint badges", () => {
    for (const name of ["apis", "categories", "dead-links", "packs"]) {
      const b = files.get(`badges/${name}.json`) as Record<string, unknown>;
      expect(b.schemaVersion).toBe(1);
      expect(typeof b.label).toBe("string");
      expect(typeof b.message).toBe("string");
      expect(b.color).toMatch(/^[0-9a-f]{6}$/);
    }
    expect((files.get("badges/packs.json") as { message: string }).message).toBe(String(PACKS.length));
    expect((files.get("stats.json") as { data: { total: number } }).data.total).toBe(snap.listings.length);
  });
});

describe("weekly sync report", () => {
  const site = "https://x.test";
  const history = readLinkHistory(root);
  const summary = summarize(snap, changelog, history);
  it("rewrites only the text between the README markers, and is stable", () => {
    const readme = `# Title\n\n${README_START}\nold\n${README_END}\n\nRest stays.\n`;
    const once = replaceSection(readme, readmeSection(summary, snap, site));
    expect(once.startsWith("# Title\n\n")).toBe(true);
    expect(once.endsWith(`${README_END}\n\nRest stays.\n`)).toBe(true);
    expect(once).not.toContain("old");
    expect(replaceSection(once, readmeSection(summary, snap, site))).toBe(once);
    expect(replaceSection("no markers", "x")).toBe("no markers");
  });
  it("the committed README section is current", () => {
    const readme = readFileSync(path.join(root, "README.md"), "utf8");
    expect(replaceSection(readme, readmeSection(summary, snap, site.replace("x.test", "eziodevio.github.io/ApiWall")))).toBe(readme);
  });
  it("reports newly broken and fixed links between the last two checks", () => {
    let h: LinkHistory = EMPTY_LINK_HISTORY;
    h = recordRun(h, health("2026-10-12T00:00:00Z", ["a", "b"]));
    h = recordRun(h, health("2026-10-19T00:00:00Z", ["b", "c"]));
    const s = summarize(snap, changelog, h);
    expect(s.links.newlyBroken).toEqual(["c"]);
    expect(s.links.fixed).toEqual(["a"]);
    expect(readmeSection(s, snap, site)).toContain("1 newly unreachable, 1 working again");
  });
  it("escapes catalog text in Markdown and keeps the issue under GitHub's size limit", () => {
    expect(mdText("a|b *c* [d](e) <x>")).toBe("a\\|b \\*c\\* \\[d\\](e) \\<x\\>");
    const issue = healthIssueBody(summary, snap, site);
    expect(issue.length).toBeLessThan(65_000);
    expect(issue).toContain("| API | Category | Failing since | Reason | Docs link |");
    expect(prBody(summary, snap, site)).toContain("### This week");
  });
});

describe("saved-list export", () => {
  const sample = (over: Partial<Entry>): Entry => ({ ...entries[0]!, ...over });
  const tricky = sample({ name: '=HYPERLINK("evil")', description: 'Has "quotes", commas\nand | pipes', url: "https://ex.test/a (b)" });
  it("neutralises spreadsheet formulas and quotes every CSV cell", () => {
    const csv = toCsv([tricky], "https://x.test");
    const row = csv.split("\r\n")[1]!;
    expect(row.startsWith(`"'=HYPERLINK(""evil"")"`)).toBe(true);
    expect(csv).toContain('"Has ""quotes"", commas\nand | pipes"');
  });
  it("escapes Markdown and only links http(s) docs", () => {
    const md = toMarkdown([tricky, sample({ id: "j", name: "J", url: "javascript:alert(1)" })], "https://x.test");
    expect(md).toContain("and \\| pipes");
    expect(md).toContain("[docs](https://ex.test/a%20%28b%29)");
    expect(md).not.toContain("javascript:");
  });
  it("writes JSON with page links", () => {
    const data = JSON.parse(toJson([entries[0]!], "https://x.test")) as { apis: { apiwallUrl: string }[] };
    expect(data.apis[0]!.apiwallUrl).toMatch(/^https:\/\/x\.test\/(apis\/|\?api=)/);
  });
});

describe("readable tiles", () => {
  it("every category tile keeps white letters at WCAG AA contrast, in both themes", () => {
    for (let i = 0; i < 60; i++)
      for (let seed = 0; seed < 7; seed++)
        for (const dark of [false, true]) {
          const bg = tileColor(i, seed, dark);
          expect(1.05 / (luminance(bg) + 0.05), bg).toBeGreaterThanOrEqual(4.5);
          expect(inkOn(bg)).toBe("#fff");
        }
  });
  it("switches to dark ink on light backgrounds", () => {
    expect(inkOn("#f5d000")).toBe("#14161f");
    expect(inkOn("#1a1a40")).toBe("#fff");
  });
});

describe("install as an app", () => {
  it("has a manifest with relative URLs (works under /ApiWall) and installable icons", () => {
    const m = manifest();
    expect(m.start_url).toBe("./");
    expect(m.scope).toBe("./");
    expect(m.display).toBe("standalone");
    const sizes = (m.icons ?? []).map((i) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect((m.icons ?? []).some((i) => i.purpose === "maskable")).toBe(true);
    for (const i of m.icons ?? []) expect(i.src.startsWith("/")).toBe(false);
  });
  it("the service worker only handles same-site GET requests and never caches server-only routes", () => {
    const sw = readFileSync(path.join(root, "public/sw.js"), "utf8");
    expect(sw).toContain('req.method !== "GET"');
    expect(sw).toContain("url.origin !== self.location.origin");
    expect(sw).toMatch(/api\\\/\(\?!catalog\$\|v1\\\/\)\|review/);
  });
});

describe("filters stay intact", () => {
  it("an empty filter still shows everything", () => {
    expect(filterEntries(entries, EMPTY_FILTERS).length).toBe(entries.length);
  });
});
