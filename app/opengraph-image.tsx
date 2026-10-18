import { ImageResponse } from "next/og";
import { loadSnapshot } from "@/lib/catalog/server";
import { categoryColor } from "@/lib/explore/colors";
import { SITE_NAME } from "@/lib/site";
import { SLOTS_PER_ROW } from "@/lib/catalog/placement";
import { monogramText } from "@/lib/catalog/marks";

// The social preview: a slice of the real wall with the site name over it. Rendered at build time.
export const dynamic = "force-static";
export const alt = `${SITE_NAME}: every public API on one zoomable wall`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const COLS = 26;
const ROWS = 14;
const TILE = 44;
const GAP = 3;

export default function OpengraphImage() {
  const snap = loadSnapshot();
  const catIndex = new Map(snap.categories.map((c, i) => [c.slug, i]));
  const bySlot = new Map<number, { name: string; slug: string }>();
  for (const l of snap.listings) {
    const p = snap.placements[l.id];
    if (p) bySlot.set(p.slot, { name: l.name, slug: l.categorySlug });
  }
  const upstream = snap.listings.filter((l) => l.origin !== "supplement");
  const apis = upstream.filter((l) => l.kind === "api").length;
  const mcp = upstream.length - apis;

  const tiles = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      // Skip ahead a few rows so the slice shows several categories.
      const t = bySlot.get((r + 2) * SLOTS_PER_ROW + c);
      tiles.push(
        <div
          key={`${r}-${c}`}
          style={{
            width: TILE,
            height: TILE,
            borderRadius: 7,
            background: t ? categoryColor(catIndex.get(t.slug) ?? 0, true) : "#1b1f2a",
            color: "rgba(255,255,255,0.85)",
            fontSize: 16,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {t ? monogramText(t.name) : ""}
        </div>,
      );
    }

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#0c0e14", position: "relative" }}>
        <div style={{ position: "absolute", left: -8, top: -14, width: COLS * (TILE + GAP), display: "flex", flexWrap: "wrap", gap: GAP }}>{tiles}</div>
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: "100%",
            height: "100%",
            display: "flex",
            background: "linear-gradient(90deg, rgba(12,14,20,0.96) 0%, rgba(12,14,20,0.86) 48%, rgba(12,14,20,0.15) 100%)",
          }}
        />
        <div style={{ position: "absolute", left: 72, top: 120, display: "flex", flexDirection: "column", color: "#fff", width: 640 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ display: "flex", flexWrap: "wrap", width: 64, gap: 6 }}>
              <div style={{ width: 29, height: 29, borderRadius: 6, background: "#3d3bff" }} />
              <div style={{ width: 29, height: 29, borderRadius: 6, background: "#16a37f" }} />
              <div style={{ width: 29, height: 29, borderRadius: 6, background: "#f07b3f" }} />
              <div style={{ width: 29, height: 29, borderRadius: 6, border: "3px dashed #fff" }} />
            </div>
            <div style={{ fontSize: 76, fontWeight: 800, letterSpacing: -2 }}>{SITE_NAME}</div>
          </div>
          <div style={{ fontSize: 44, fontWeight: 700, marginTop: 28, lineHeight: 1.15 }}>Every public API on one zoomable wall</div>
          <div style={{ fontSize: 28, marginTop: 22, color: "rgba(255,255,255,0.78)" }}>
            {`${apis.toLocaleString("en")} APIs · ${mcp} MCP servers · AI models · search, filter, open docs`}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
