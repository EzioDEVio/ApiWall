import type { Changelog, ChangeEntry } from "./history";
import type { LinkHistory } from "./linkHistory";
import type { CatalogSnapshot } from "./types";

/**
 * The weekly sync's report: the README's "This week on ApiWall" section, the pull request
 * body and the link-health issue. Everything here is a pure function of the committed data
 * (no clocks), so a quiet week produces exactly the same text and opens no pull request.
 */
export const README_START = "<!-- this-week:start -->";
export const README_END = "<!-- this-week:end -->";

export interface SyncSummary {
  total: number;
  apis: number;
  mcp: number;
  categories: number;
  latest: ChangeEntry | null;
  links: {
    checked: number;
    unreachable: number;
    /** When the current set of unreachable links was first seen (null before the first check). */
    since: string | null;
    newlyBroken: string[];
    fixed: string[];
  };
}

export function summarize(snap: CatalogSnapshot, changelog: Changelog, history: LinkHistory): SyncSummary {
  const upstream = snap.listings.filter((l) => l.origin !== "supplement");
  const apis = upstream.filter((l) => l.kind === "api").length;
  const periods = history.periods;
  const last = periods[periods.length - 1];
  const prev = periods[periods.length - 2];
  const before = new Set(prev?.unreachable ?? []);
  const now = new Set(last?.unreachable ?? []);
  return {
    total: snap.listings.length,
    apis,
    mcp: upstream.length - apis,
    categories: snap.categories.length,
    latest: changelog.entries[0] ?? null,
    links: {
      checked: last?.checked ?? 0,
      unreachable: last?.unreachable.length ?? 0,
      since: last?.from ?? null,
      newlyBroken: prev ? [...now].filter((id) => !before.has(id)) : [],
      fixed: prev ? [...before].filter((id) => !now.has(id)) : [],
    },
  };
}

const fmt = (n: number) => n.toLocaleString("en");
const day = (iso: string) => iso.slice(0, 10);
/** Escapes text for a Markdown table cell or link label. */
export const mdText = (s: string) =>
  s
    .replace(/[\\`*_[\]<>|]/g, (c) => `\\${c}`)
    .replace(/\s+/g, " ")
    .trim();

type Names = Map<string, { name: string; slug?: string; category: string; url: string | null }>;
const namesOf = (snap: CatalogSnapshot): Names => new Map(snap.listings.map((l) => [l.id, { name: l.name, slug: l.slug, category: l.category, url: l.url }]));

function pageLink(site: string, names: Names, id: string, fallback: string): string {
  const n = names.get(id);
  return n?.slug ? `[${mdText(n.name)}](${site}/apis/${n.slug}/)` : mdText(n?.name ?? fallback);
}

/** The README section (between the markers). */
export function readmeSection(s: SyncSummary, snap: CatalogSnapshot, site: string): string {
  const names = namesOf(snap);
  const lines: string[] = [];
  lines.push(`**${fmt(s.apis)} APIs** and **${s.mcp} MCP servers** across **${s.categories} categories**.`);
  if (s.latest) {
    const added = s.latest.added;
    const removed = s.latest.removed.length;
    lines.push("");
    lines.push(
      `**Latest catalog update (${day(s.latest.at)}):** ${added.length ? `${added.length} new` : "no new APIs"}${removed ? `, ${removed} removed` : ""}.` +
        (added.length
          ? ` ${added
              .slice(0, 8)
              .map((a) => pageLink(site, names, a.id, a.name))
              .join(" · ")}${added.length > 8 ? ` and ${added.length - 8} more` : ""}.`
          : ""),
    );
  }
  if (s.links.since) {
    lines.push("");
    const delta = [
      s.links.newlyBroken.length ? `${s.links.newlyBroken.length} newly unreachable` : "",
      s.links.fixed.length ? `${s.links.fixed.length} working again` : "",
    ]
      .filter(Boolean)
      .join(", ");
    lines.push(
      `**Docs links:** ${fmt(s.links.checked - s.links.unreachable)} of ${fmt(s.links.checked)} reachable (${fmt(s.links.unreachable)} not reachable since ${day(s.links.since)}${delta ? `; ${delta}` : ""}).`,
    );
  }
  lines.push("");
  lines.push(`[What's new](${site}/changes/) · [Stats](${site}/stats/) · [Starter packs](${site}/packs/)`);
  return lines.join("\n");
}

/** Replaces the text between the markers; returns the README unchanged when the markers are missing. */
export function replaceSection(readme: string, body: string): string {
  const a = readme.indexOf(README_START);
  const b = readme.indexOf(README_END);
  if (a < 0 || b < a) return readme;
  return `${readme.slice(0, a + README_START.length)}\n${body}\n${readme.slice(b)}`;
}

/** The pull request description. */
export function prBody(s: SyncSummary, snap: CatalogSnapshot, site: string): string {
  const names = namesOf(snap);
  const out = [
    "Automated import of the latest [public-apis](https://github.com/public-apis/public-apis) catalog, logos for new listings and the weekly docs-link check.",
    "Existing tiles keep their positions and every API keeps its page address.",
    "",
    "### This week",
    "",
    readmeSection(s, snap, site),
  ];
  const list = (title: string, ids: string[]) => {
    if (!ids.length) return;
    out.push("", `<details><summary>${title} (${ids.length})</summary>`, "");
    for (const id of ids.slice(0, 100)) out.push(`- ${pageLink(site, names, id, id)}`);
    if (ids.length > 100) out.push(`- and ${ids.length - 100} more`);
    out.push("", "</details>");
  };
  if (s.latest)
    list(
      "New APIs",
      s.latest.added.map((a) => a.id),
    );
  list("Docs links newly unreachable", s.links.newlyBroken);
  list("Docs links working again", s.links.fixed);
  out.push("", "Checks: `npm test` passed in the sync job; CI runs the full suite on this pull request.");
  return out.join("\n");
}

const MAX_ISSUE_ROWS = 300; // keeps the issue well under GitHub's 65,536-character limit

/** The body of the pinned "Docs-link health" issue. */
export function healthIssueBody(s: SyncSummary, snap: CatalogSnapshot, site: string): string {
  const names = namesOf(snap);
  const health = snap.linkHealth;
  const out = [
    "This issue is updated by the weekly catalog sync. It lists every docs link that failed twice in a row at the last check.",
    "A link that answers again is removed automatically; nothing here is hidden from the site, which shows a “Docs link not reachable” note instead.",
    "",
    readmeSection(s, snap, site),
    "",
  ];
  const rows = Object.entries(health?.unreachable ?? {}).sort((a, b) => a[1].since.localeCompare(b[1].since) || a[0].localeCompare(b[0]));
  if (!rows.length) out.push("**Every checked docs link answered.** 🎉");
  else {
    out.push("| API | Category | Failing since | Reason | Docs link |", "| --- | --- | --- | --- | --- |");
    for (const [id, r] of rows.slice(0, MAX_ISSUE_ROWS)) {
      const n = names.get(id);
      const host = n?.url ? safeHost(n.url) : "";
      out.push(
        `| ${pageLink(site, names, id, id)}${s.links.newlyBroken.includes(id) ? " 🆕" : ""} | ${mdText(n?.category ?? "")} | ${day(r.since)} | ${mdText(r.reason)} | ${host ? mdText(host) : "—"} |`,
      );
    }
    if (rows.length > MAX_ISSUE_ROWS) out.push("", `…and ${rows.length - MAX_ISSUE_ROWS} more. The full list is in \`data/link-health.json\`.`);
  }
  out.push(
    "",
    "**Fix one:** if an API moved, open a pull request on [public-apis/public-apis](https://github.com/public-apis/public-apis) with the new link, or [report the listing here](https://github.com/EzioDEVio/ApiWall/issues/new?template=report-listing.yml).",
  );
  return out.join("\n");
}

function safeHost(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
