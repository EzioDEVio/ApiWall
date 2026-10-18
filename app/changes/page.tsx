import type { Metadata } from "next";
import Link from "next/link";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { EMPTY_CHANGELOG, type Changelog } from "@/lib/catalog/history";
import { loadSnapshot } from "@/lib/catalog/server";

export const metadata: Metadata = { title: "What's new", description: "APIs added to and removed from the wall, import by import." };

function loadChangelog(): Changelog {
  const p = path.join(process.cwd(), "data", "changelog.json");
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as Changelog) : EMPTY_CHANGELOG;
}
const fmt = (iso: string) => new Date(iso).toLocaleDateString("en", { dateStyle: "long", timeZone: "UTC" });

export default function ChangesPage() {
  const log = loadChangelog();
  const snap = loadSnapshot();
  const live = new Set(snap.listings.map((l) => l.id));
  return (
    <div className="page narrow prose" data-testid="changes">
      <p className="eyebrow">What&apos;s new</p>
      <h1>Changes to the wall</h1>
      <p className="lede">
        Every week ApiWall checks the public-apis catalog for new and removed APIs. Each change is listed here, and new APIs carry a{" "}
        <span className="tag tag-new">New</span> badge for seven days. <Link href="/?new=yes">See this week&apos;s new APIs on the wall</Link>.
      </p>
      {log.entries.length === 0 && <p className="muted">No changes recorded since the first import on {fmt(snap.source.importedAt)}.</p>}
      {log.entries.map((e) => (
        <section key={e.at} className="change" aria-labelledby={`c-${e.at}`}>
          <h2 id={`c-${e.at}`}>
            {fmt(e.at)}{" "}
            <span className="muted small">
              {e.added.length ? `${e.added.length} added` : ""}
              {e.added.length && e.removed.length ? " · " : ""}
              {e.removed.length ? `${e.removed.length} removed` : ""}
            </span>
          </h2>
          {e.note && <p>{e.note}</p>}
          {e.added.length > 0 && (
            <ul className="change-list">
              {e.added.map((a) => (
                <li key={a.id}>
                  <span className="tag tag-new">Added</span>{" "}
                  {live.has(a.id) ? <Link href={`/?api=${encodeURIComponent(a.id)}`}>{a.name}</Link> : <span>{a.name}</span>}{" "}
                  <span className="muted small">{a.category}</span>
                </li>
              ))}
            </ul>
          )}
          {e.removed.length > 0 && (
            <ul className="change-list">
              {e.removed.map((a) => (
                <li key={a.id}>
                  <span className="tag">Removed</span> {a.name} <span className="muted small">{a.category}</span>
                </li>
              ))}
            </ul>
          )}
          {e.commit && (
            <p className="muted small">
              Catalog commit{" "}
              <a href={`https://github.com/${snap.source.repo}/commit/${e.commit}`} target="_blank" rel="noopener noreferrer">
                <code>{e.commit.slice(0, 7)}</code>
              </a>
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
