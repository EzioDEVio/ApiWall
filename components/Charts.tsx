/*
 * Small, dependency-free SVG charts for the stats page. Server-rendered; every mark carries a
 * <title> (native hover tooltip) and every chart has a table view, so nothing relies on colour
 * or on hovering alone. Colours come from CSS variables (--viz-1 …) with light and dark steps.
 */
import type { ReactNode } from "react";

export function StatTile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="stat-tile">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {note && <span className="stat-note">{note}</span>}
    </div>
  );
}

function TableView({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <details className="viz-table">
      <summary>Show as a table</summary>
      <table>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) =>
                j === 0 ? (
                  <th key={j} scope="row">
                    {c}
                  </th>
                ) : (
                  <td key={j}>{typeof c === "number" ? c.toLocaleString("en") : c}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

export function Figure({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <figure className="viz">
      <figcaption>
        <span className="viz-title">{title}</span>
        {sub && <span className="viz-sub">{sub}</span>}
      </figcaption>
      {children}
    </figure>
  );
}

/** Horizontal bars, one series: label on the left, value at the bar end. */
export function HBars({ data, caption, href }: { data: { label: string; value: number; key: string }[]; caption: string; href?: (key: string) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const row = 26;
  const labelW = 210;
  const W = 640;
  const barW = W - labelW - 60;
  const H = data.length * row;
  return (
    <>
      {/* With links inside, the chart is a group of links rather than a single image. */}
      <svg className="viz-svg" viewBox={`0 0 ${W} ${H}`} role={href ? "group" : "img"} aria-label={caption}>
        {data.map((d, i) => {
          const w = Math.max(2, (d.value / max) * barW);
          const y = i * row;
          const bar = (
            <g key={d.key} className="viz-hit">
              <title>{`${d.label}: ${d.value.toLocaleString("en")}`}</title>
              <rect x={0} y={y} width={W} height={row} fill="transparent" />
              <text x={labelW - 10} y={y + row / 2} className="viz-label" textAnchor="end" dominantBaseline="central">
                {d.label}
              </text>
              <rect x={labelW} y={y + 6} width={w} height={row - 12} rx={4} className="viz-s1" />
              <text x={labelW + w + 6} y={y + row / 2} className="viz-value" dominantBaseline="central">
                {d.value.toLocaleString("en")}
              </text>
            </g>
          );
          return href ? (
            <a key={d.key} href={href(d.key)}>
              {bar}
            </a>
          ) : (
            bar
          );
        })}
      </svg>
      <TableView caption={caption} head={["Category", "APIs"]} rows={data.map((d) => [d.label, d.value])} />
    </>
  );
}

/** A single 100% bar split into up to four parts, with a legend and direct labels. */
export function SplitBar({ parts, caption, unit = "APIs" }: { parts: { label: string; value: number }[]; caption: string; unit?: string }) {
  const total = Math.max(
    1,
    parts.reduce((a, p) => a + p.value, 0),
  );
  const W = 640;
  // Where each segment starts: the running total of the ones before it.
  const starts = parts.map((_, i) => parts.slice(0, i).reduce((a, p) => a + (p.value / total) * W, 0));
  return (
    <>
      <svg className="viz-svg" viewBox={`0 0 ${W} 34`} role="img" aria-label={caption}>
        {parts.map((p, i) => {
          const w = (p.value / total) * W;
          const x = starts[i]!;
          return (
            <g key={p.label}>
              <title>{`${p.label}: ${p.value.toLocaleString("en")} ${unit} (${Math.round((p.value / total) * 100)}%)`}</title>
              <rect x={x + (i ? 1 : 0)} y={0} width={Math.max(0, w - (i ? 2 : 1))} height={34} rx={4} className={`viz-s${i + 1}`} />
              {w > 60 && (
                <text x={x + 10} y={17} className="viz-on" dominantBaseline="central">
                  {Math.round((p.value / total) * 100)}%
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <ul className="viz-legend">
        {parts.map((p, i) => (
          <li key={p.label}>
            <i className={`viz-s${i + 1}`} aria-hidden="true" />
            {p.label} <span className="muted">{p.value.toLocaleString("en")}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Vertical bars over time (one series), with a dated axis. */
export function TimeBars({ data, caption, valueLabel }: { data: { at: string; value: number }[]; caption: string; valueLabel: string }) {
  const W = 640;
  const H = 160;
  const pad = 26;
  const max = Math.max(1, ...data.map((d) => d.value));
  const slot = (W - 20) / Math.max(data.length, 6);
  const bw = Math.min(42, slot - 8);
  const day = (iso: string) => new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" });
  return (
    <>
      <svg className="viz-svg" viewBox={`0 0 ${W} ${H + pad}`} role="img" aria-label={caption}>
        <line x1={0} x2={W} y1={H} y2={H} className="viz-axis" />
        {data.map((d, i) => {
          const h = Math.max(2, (d.value / max) * (H - 24));
          const x = 10 + i * slot + (slot - bw) / 2;
          return (
            <g key={d.at}>
              <title>{`${day(d.at)}: ${d.value.toLocaleString("en")} ${valueLabel}`}</title>
              <rect x={x} y={H - h} width={bw} height={h} rx={4} className="viz-s1" />
              <text x={x + bw / 2} y={H - h - 6} className="viz-value" textAnchor="middle">
                {d.value.toLocaleString("en")}
              </text>
              <text x={x + bw / 2} y={H + 16} className="viz-label" textAnchor="middle">
                {day(d.at)}
              </text>
            </g>
          );
        })}
      </svg>
      <TableView caption={caption} head={["Date", valueLabel]} rows={data.map((d) => [day(d.at), d.value])} />
    </>
  );
}
