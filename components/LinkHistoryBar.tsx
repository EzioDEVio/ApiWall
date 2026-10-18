import type { LinkSpan } from "@/lib/catalog/linkHistory";

const day = (iso: string) => new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** The docs link's state across ApiWall's weekly checks, as a row of labelled spans. */
export function LinkHistoryBar({ spans }: { spans: LinkSpan[] }) {
  if (!spans.length) return null;
  return (
    <div className="link-history" data-testid="link-history">
      <span className="link-history-label">Docs link history</span>
      <ol>
        {spans.map((s) => (
          <li key={s.from} className={s.state === "reachable" ? "is-ok" : "is-down"}>
            <span className="sr-only">{s.state === "reachable" ? "Reachable" : "Not reachable"}: </span>
            <span aria-hidden="true">{s.state === "reachable" ? "✓" : "✕"}</span> {s.from === s.to ? day(s.from) : `${day(s.from)} – ${day(s.to)}`}
          </li>
        ))}
      </ol>
    </div>
  );
}
