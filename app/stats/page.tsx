import type { Metadata } from "next";
import Link from "next/link";
import { pageData } from "@/lib/catalog/pages";
import { loadSnapshot } from "@/lib/catalog/server";
import { readChangelog, readLinkHistory } from "@/lib/catalog/files";
import { computeStats, pct } from "@/lib/catalog/stats";
import { PUBLIC_API_VERSION } from "@/lib/catalog/publicApi";
import { OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/site";
import { Figure, HBars, SplitBar, StatTile, TimeBars } from "@/components/Charts";

const description = "The state of public APIs: how many need a key, support HTTPS and CORS, which categories are biggest, and how many docs links are dead.";

export const metadata: Metadata = {
  title: "Stats: the state of public APIs",
  description,
  alternates: { canonical: `${SITE_URL}/stats/` },
  openGraph: { title: `The state of public APIs · ${SITE_NAME}`, description, url: `${SITE_URL}/stats/`, images: [OG_IMAGE] },
};

const day = (iso: string) => new Date(iso).toLocaleDateString("en", { dateStyle: "long", timeZone: "UTC" });

export default function StatsPage() {
  const { entries } = pageData();
  const snap = loadSnapshot();
  const s = computeStats(entries, snap.categories, readLinkHistory(process.cwd()), readChangelog(process.cwd()));
  const n = (x: number) => x.toLocaleString("en");
  return (
    <div className="page stats-page" data-testid="stats-page">
      <p className="eyebrow">Stats</p>
      <h1>The state of public APIs</h1>
      <p className="lede">
        Numbers for every API on the wall, from the community catalog and ApiWall&apos;s own weekly checks. Updated with each catalog sync; last import{" "}
        {day(snap.source.importedAt)}.
      </p>

      <div className="stat-tiles" data-testid="stat-tiles">
        <StatTile label="APIs on the wall" value={n(s.total)} note={`${n(s.apis)} HTTP APIs · ${n(s.mcp)} MCP servers`} />
        <StatTile label="Categories" value={n(s.categories)} />
        <StatTile label="Need no key" value={`${pct(s.auth.none, s.apis)}%`} note={`${n(s.auth.none)} HTTP APIs list no auth`} />
        <StatTile label="Serve over HTTPS" value={`${pct(s.https.yes, s.apis)}%`} note={`${n(s.https.no)} do not`} />
        <StatTile label="CORS enabled" value={`${pct(s.cors.yes, s.apis)}%`} note={`${pct(s.cors.unknown, s.apis)}% not stated`} />
        <StatTile
          label="Dead docs links"
          value={s.links.checkedAt ? n(s.links.unreachable) : "—"}
          note={s.links.checkedAt ? `${pct(s.links.unreachable, s.total)}% · checked ${day(s.links.checkedAt)}` : "First check pending"}
        />
      </div>

      <div className="viz-grid">
        <Figure title="Biggest categories" sub="APIs per category, top 15 (cross-listed APIs count in each)">
          <HBars
            caption="APIs per category"
            data={s.topCategories.map((c) => ({ key: c.slug, label: c.name, value: c.count }))}
            href={(slug) => `${SITE_URL}/categories/${slug}/`}
          />
        </Figure>
        <div className="viz-stack">
          <Figure title="Do I need a key?" sub={`Authentication for ${n(s.apis)} HTTP APIs`}>
            <SplitBar
              caption="Authentication"
              parts={[
                { label: "No auth listed", value: s.auth.none },
                { label: "API key", value: s.auth.apiKey },
                { label: "OAuth", value: s.auth.oauth },
                { label: "Other", value: s.auth.other },
              ]}
            />
          </Figure>
          <Figure title="HTTPS" sub="As listed in the catalog">
            <SplitBar
              caption="HTTPS support"
              parts={[
                { label: "Yes", value: s.https.yes },
                { label: "No", value: s.https.no },
                { label: "Not stated", value: s.https.unknown },
              ]}
            />
          </Figure>
          <Figure title="CORS (call it from a web page?)" sub="As listed in the catalog">
            <SplitBar
              caption="CORS support"
              parts={[
                { label: "Yes", value: s.cors.yes },
                { label: "No", value: s.cors.no },
                { label: "Not stated", value: s.cors.unknown },
              ]}
            />
          </Figure>
        </div>
        <Figure
          title="Dead docs links over time"
          sub={
            s.linkTrend.length > 1
              ? "Unreachable links at each weekly check where the set changed"
              : "The weekly check started recently; the trend fills in week by week"
          }
        >
          <TimeBars caption="Unreachable docs links" valueLabel="unreachable links" data={s.linkTrend.map((p) => ({ at: p.at, value: p.unreachable }))} />
        </Figure>
        <Figure title="APIs added per sync" sub="From the What's new log">
          <TimeBars caption="APIs added per sync" valueLabel="APIs added" data={s.additions.map((a) => ({ at: a.at, value: a.added }))} />
        </Figure>
      </div>

      <p className="muted small stats-note">
        Auth, HTTPS and CORS come from the{" "}
        <a href={`https://github.com/${snap.source.repo}`} target="_blank" rel="noopener noreferrer">
          public-apis
        </a>{" "}
        catalog as listed; &quot;dead&quot; means the docs link failed twice in ApiWall&apos;s weekly check. Get these numbers as JSON:{" "}
        <a href={`${SITE_URL}/api/${PUBLIC_API_VERSION}/stats.json`}>/api/{PUBLIC_API_VERSION}/stats.json</a> · <Link href="/packs/">Starter packs</Link> ·{" "}
        <Link href="/changes/">What&apos;s new</Link>
      </p>
    </div>
  );
}
