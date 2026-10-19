"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Entry } from "@/lib/explore/model";
import { brandInk, categoryColor, inkOn, tileColor } from "@/lib/explore/colors";
import { SLOTS_PER_ROW, TILE_SIZE, slotToPlacement } from "@/lib/catalog/placement";
import { type LensId, lensColor } from "@/lib/explore/lenses";
import { cellToLayoutSlot, districts, filteredColumns, filteredLayout, fullLayout, type LayoutItem, type MapLayout, slotXY } from "@/lib/explore/layout";
import { asset } from "@/lib/site";
import { isDarkNow, onThemeChange } from "@/lib/theme";
import { useIsDark } from "@/lib/useTheme";

// The map is a native scroll container: a transparent spacer the size of the
// zoomed map scrolls inside it, and one viewport-sized canvas behind it draws
// only what is visible. Scrollbars, trackpads, touch and keyboard scrolling all
// work as on any page, and the DOM stays tiny at every zoom level.

export interface MosaicRegion {
  slug: string;
  name: string;
  start: number;
  end: number;
}

export interface MosaicHandle {
  resetView: () => void;
  focusEntry: (id: string) => void;
  /** Scrolls so a slot (e.g. the start of a category band) is near the top-left of the view. */
  jumpTo: (slot: number) => void;
}

interface Props {
  /** The visible result set (every entry when nothing is filtered). The map draws exactly these. */
  entries: Entry[];
  /** True when any filter or search is active: the map then packs only the results into a compact grid. */
  filtered: boolean;
  /** The selected category, if any: results are shown as one group under its name. */
  focusCategory?: { slug: string; name: string } | null;
  /** Recolour tiles by a fact (auth, HTTPS, CORS, logo) instead of by category. */
  lens?: LensId;
  /** Saved APIs get a gold star; new ones a NEW badge. */
  savedIds?: Set<string>;
  newIds?: Set<string>;
  /** Extra space taken by floating UI at the bottom (the phone tab bar). */
  insetBottom?: number;
  categoryIndex: Map<string, number>;
  categoryGlyph: Map<string, string>;
  glyphs: Record<string, string[]>;
  regions: MosaicRegion[];
  providerRegion: { start: number; end: number };
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpenSlot: () => void;
  /** Screen space covered by floating UI; map content and "whole map" stay clear of it. */
  insetTop?: number;
  insetRight?: number;
}

const PAD = 20; // space around the map, in screen px
const LOGO_PX = 14; // brand marks and logos appear from this tile size
const MONO_PX = 22; // monogram letters appear from this tile size
const DETAIL_PX = 50; // names and category icons appear from this tile size
const LABEL_MAX_PX = 30; // category band labels below this tile size
const MAX_TILE_PX = 160;
const FIT_MAX_TILE_PX = 112; // a filtered view never blows a handful of tiles up past this
const MIN_FIT_TILE_PX = 56; // below this a filtered view fills the width and scrolls instead
const BOTTOM_UI = 56; // floating status bar along the bottom edge
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const DEFAULT_TILE_PX = (width: number) => (width < 640 ? 52 : 58);

const TIP_AUTH: Record<string, string> = {
  none: "No auth",
  apiKey: "API key",
  oauth: "OAuth",
  "x-mashape-key": "Mashape key",
  "user-agent": "User-Agent",
  other: "Other auth",
};

/** Pointer position, plus which way the preview opens so it stays on screen near the edges. */
type Spot = { x: number; y: number; flipX: boolean; flipY: boolean };
type Hover = ({ kind: "entry"; id: string } & Spot) | ({ kind: "open" } & Spot) | null;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export const Mosaic = forwardRef<MosaicHandle, Props>(function Mosaic(
  {
    entries,
    filtered,
    focusCategory = null,
    lens = "category",
    savedIds,
    newIds,
    insetBottom = 0,
    categoryIndex,
    categoryGlyph,
    glyphs,
    regions,
    providerRegion,
    selectedId,
    onSelect,
    onOpenSlot,
    insetTop = 0,
    insetRight = 0,
  },
  ref,
) {
  const stageRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const scale = useRef(1); // screen px per logical cell
  const insets = useRef({ top: insetTop, right: insetRight, bottom: insetBottom });
  /** Floating UI along the bottom: the status bar, plus the tab bar on phones. */
  const bottomUi = () => BOTTOM_UI + insets.current.bottom;
  const zoomAnim = useRef(0);
  const introStart = useRef(0);
  const introDone = useRef(false);
  const vp = useRef({ w: 0, h: 0, dpr: 1 });
  const frame = useRef(0);
  const hoverRef = useRef<string | null>(null);
  const [hover, setHover] = useState<Hover>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [tilePx, setTilePx] = useState(0);
  const [mapLarger, setMapLarger] = useState(false);
  const [announce, setAnnounce] = useState("");
  const pathCache = useRef(new Map<string, Path2D>());
  const imgCache = useRef(new Map<string, HTMLImageElement | "error">());
  const darkRef = useRef(false); // for the canvas, which redraws outside React
  const darkTheme = useIsDark(); // for React-rendered parts
  const drawRef = useRef<() => void>(() => {});
  const schedule = useCallback(() => {
    if (!frame.current) frame.current = requestAnimationFrame(() => drawRef.current());
  }, []);

  // Area available for tiles (viewport minus floating UI); decides filtered-grid columns.
  const [area, setArea] = useState({ w: 0, h: 0 });
  const cols = filtered ? filteredColumns(entries.length, Math.max(0, area.w - 2 * PAD), Math.max(1, area.h - 2 * PAD), area.w < 640 ? 60 : 72) : SLOTS_PER_ROW;
  const names = useMemo(() => new Map(regions.map((r) => [r.slug, r.name])), [regions]);
  const mapLayout: MapLayout = useMemo(
    () =>
      filtered
        ? filteredLayout(entries, {
            cols,
            categoryOrder: categoryIndex,
            names,
            focus: focusCategory,
          })
        : fullLayout(entries, regions, providerRegion),
    [filtered, entries, cols, categoryIndex, names, focusCategory, regions, providerRegion],
  );
  const L = useRef<MapLayout>(mapLayout);
  const dists = useMemo(() => districts(mapLayout, names), [mapLayout, names]);
  const { bySlot, byId } = mapLayout;

  // ---- geometry -----------------------------------------------------------
  const layout = (s: number) => {
    const spanW = L.current.width * s;
    const spanH = L.current.height * s;
    const { w, h } = vp.current;
    const { top, right } = insets.current;
    const aw = w - right;
    const ah = h - top - bottomUi();
    const ox = spanW + 2 * PAD <= aw ? (aw - spanW) / 2 : PAD;
    const oy = spanH + 2 * PAD <= ah ? top + (ah - spanH) / 2 : PAD + top;
    return {
      cw: Math.max(w, spanW + 2 * PAD + right),
      ch: Math.max(h, spanH + 2 * PAD + top + bottomUi()),
      ox,
      oy,
    };
  };
  const fitScale = () => {
    const { w, h } = vp.current;
    const { top, right } = insets.current;
    return Math.max(0.05, Math.min((w - right - 2 * PAD) / L.current.width, (h - top - bottomUi() - 2 * PAD) / L.current.height));
  };
  const clampScale = (s: number) => Math.min(Math.max(s, fitScale()), MAX_TILE_PX / TILE_SIZE);
  /** Screen offset of logical cell (0,0) inside the viewport. */
  const origin = () => {
    const sc = scrollRef.current;
    const { ox, oy } = layout(scale.current);
    return { tx: ox - (sc?.scrollLeft ?? 0), ty: oy - (sc?.scrollTop ?? 0) };
  };

  const applySize = (s: number) => {
    const sp = spacerRef.current;
    if (!sp) return;
    const { cw, ch } = layout(s);
    sp.style.width = `${Math.ceil(cw)}px`;
    sp.style.height = `${Math.ceil(ch)}px`;
    setMapLarger(
      L.current.mode === "full" &&
        (L.current.width * s + 2 * PAD > vp.current.w - insets.current.right + 1 ||
          L.current.height * s + 2 * PAD > vp.current.h - insets.current.top - bottomUi() + 1),
    );
  };

  /** Changes zoom while keeping the logical point under (ax, ay) fixed on screen. */
  const setScale = useCallback(
    (next: number, ax = vp.current.w / 2, ay = vp.current.h / 2) => {
      const sc = scrollRef.current;
      if (!sc) return;
      const s = scale.current;
      const ns = clampScale(next);
      const before = layout(s);
      const cx = (sc.scrollLeft + ax - before.ox) / s;
      const cy = (sc.scrollTop + ay - before.oy) / s;
      scale.current = ns;
      applySize(ns);
      const after = layout(ns);
      sc.scrollLeft = cx * ns + after.ox - ax;
      sc.scrollTop = cy * ns + after.oy - ay;
      setTilePx(Math.round(TILE_SIZE * ns));
      schedule();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [schedule],
  );

  /** Animated zoom for buttons, keys and double-click; wheel and pinch stay direct. */
  const zoomTo = useCallback(
    (target: number, ax?: number, ay?: number) => {
      cancelAnimationFrame(zoomAnim.current);
      const s0 = scale.current;
      const s1 = clampScale(target);
      if (reducedMotion() || Math.abs(s1 - s0) < 1e-4) return setScale(s1, ax, ay);
      const t0 = performance.now();
      const step = () => {
        const t = Math.min(1, (performance.now() - t0) / 260);
        const e = 1 - Math.pow(1 - t, 3);
        setScale(s0 * Math.pow(s1 / s0, e), ax, ay);
        if (t < 1) zoomAnim.current = requestAnimationFrame(step);
      };
      zoomAnim.current = requestAnimationFrame(step);
    },
    [setScale], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const resetView = useCallback(() => zoomTo(fitScale()), [zoomTo]); // eslint-disable-line react-hooks/exhaustive-deps -- reads refs only

  function layoutWith(i: { top: number; right: number; bottom: number }, s: number) {
    const saved = insets.current;
    insets.current = i;
    const r = layout(s);
    insets.current = saved;
    return r;
  }

  // Insets change when floating panels open or resize: keep the same content centred.
  useEffect(() => {
    const prev = insets.current;
    insets.current = { top: insetTop, right: insetRight, bottom: insetBottom };
    if (vp.current.w)
      setArea({
        w: vp.current.w - insetRight,
        h: vp.current.h - insetTop - BOTTOM_UI - insetBottom,
      });
    const sc = scrollRef.current;
    if (!sc || vp.current.w === 0 || (prev.top === insetTop && prev.right === insetRight && prev.bottom === insetBottom)) return;
    const s = scale.current;
    const before = { ...layoutWith(prev, s) };
    // If the whole map (or all results) was fitted to the screen, keep it fitted to the new space.
    const saved = insets.current;
    insets.current = prev;
    const wasFit = Math.abs(s - fitScale()) < 1e-3 || (L.current.mode === "filtered" && s >= fitScale() - 1e-3 && s <= FIT_MAX_TILE_PX / TILE_SIZE + 1e-3);
    insets.current = saved;
    const ns = wasFit ? (L.current.mode === "filtered" ? s : fitScale()) : clampScale(s);
    scale.current = ns;
    applySize(ns);
    const after = layout(ns);
    sc.scrollLeft += after.ox - before.ox;
    sc.scrollTop += after.oy - before.oy;
    setTilePx(Math.round(TILE_SIZE * ns));
    schedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insetTop, insetRight, insetBottom, schedule]);

  /** Scrolls (and zooms in if needed) so a tile is fully visible. */
  const reveal = useCallback(
    (e: Entry, minTilePx = 0) => {
      const sc = scrollRef.current;
      const item = L.current.byId.get(e.id);
      if (!sc || !item) return;
      if (TILE_SIZE * scale.current < minTilePx) setScale(minTilePx / TILE_SIZE);
      const s = scale.current;
      const { ox, oy } = layout(s);
      const x = ox + item.x * s;
      const y = oy + item.y * s;
      const tp = TILE_SIZE * s;
      const { w, h } = vp.current;
      if (x < sc.scrollLeft || x + tp > sc.scrollLeft + w) sc.scrollLeft = x + tp / 2 - w / 2;
      if (y < sc.scrollTop || y + tp > sc.scrollTop + h) sc.scrollTop = y + tp / 2 - h / 2;
      schedule();
    },
    [setScale, schedule], // eslint-disable-line react-hooks/exhaustive-deps -- layout() reads refs only
  );

  const flight = useRef(0);
  /**
   * Eased flight to a tile far away (palette, "Surprise me"): zooms and pans together in one
   * smooth move. Instant with reduced motion, and when the tile is already in view.
   */
  const flyTo = useCallback(
    (e: Entry, minTilePx: number) => {
      const sc = scrollRef.current;
      const item = L.current.byId.get(e.id);
      if (!sc || !item) return;
      cancelAnimationFrame(flight.current);
      cancelAnimationFrame(zoomAnim.current);
      const s0 = scale.current;
      const s1 = clampScale(Math.max(s0, minTilePx / TILE_SIZE));
      const { w, h } = vp.current;
      const l0 = layout(s0);
      const c0 = { x: (sc.scrollLeft + w / 2 - l0.ox) / s0, y: (sc.scrollTop + h / 2 - l0.oy) / s0 };
      const c1 = { x: item.x + TILE_SIZE / 2, y: item.y + TILE_SIZE / 2 };
      const inView = (() => {
        const x = l0.ox + item.x * s0 - sc.scrollLeft;
        const y = l0.oy + item.y * s0 - sc.scrollTop;
        const tp = TILE_SIZE * s0;
        return x >= 0 && y >= 0 && x + tp <= w && y + tp <= h;
      })();
      if (reducedMotion() || (s1 === s0 && inView)) return reveal(e, minTilePx);
      const place = (s: number, cx: number, cy: number) => {
        scale.current = s;
        applySize(s);
        const { ox, oy } = layout(s);
        sc.scrollLeft = ox + cx * s - w / 2;
        sc.scrollTop = oy + cy * s - h / 2;
        setTilePx(Math.round(TILE_SIZE * s));
        schedule();
      };
      const t0 = performance.now();
      const ms = 520;
      const step = () => {
        const t = Math.min(1, (performance.now() - t0) / ms);
        const k = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; // ease in-out
        place(s0 * Math.pow(s1 / s0, k), c0.x + (c1.x - c0.x) * k, c0.y + (c1.y - c0.y) * k);
        if (t < 1) flight.current = requestAnimationFrame(step);
      };
      flight.current = requestAnimationFrame(step);
    },
    [schedule], // eslint-disable-line react-hooks/exhaustive-deps -- layout() and reveal read refs only
  );

  // When the result set changes: filtered views fit their results; clearing every filter
  // returns to the full map exactly where it was left. Tiles replay a short settle-in.
  const savedFull = useRef<{ s: number; left: number; top: number } | null>(null);
  const heals = useRef(0);
  /** Fits a filtered layout: the whole result set when tiles stay readable, else full width from the top. */
  const fitFiltered = () => {
    const sc = scrollRef.current;
    const lay = L.current;
    if (!sc || lay.mode !== "filtered" || vp.current.w === 0) return;
    const { w, h } = vp.current;
    const { top, right } = insets.current;
    const fitW = (w - right - 2 * PAD) / lay.width;
    const fitBoth = Math.min(fitW, (h - top - bottomUi() - 2 * PAD) / lay.height);
    const cap = FIT_MAX_TILE_PX / TILE_SIZE;
    // Whole result set on screen when tiles stay readable; otherwise fill the width and scroll down.
    scale.current = Math.min(MAX_TILE_PX / TILE_SIZE, Math.max(0.05, TILE_SIZE * fitBoth >= MIN_FIT_TILE_PX ? Math.min(fitBoth, cap) : Math.min(fitW, cap)));
    applySize(scale.current);
    sc.scrollLeft = 0;
    sc.scrollTop = 0;
    setTilePx(Math.round(TILE_SIZE * scale.current));
  };
  const lastFocus = useRef<string | null>(null);
  useLayoutEffect(() => {
    const was = L.current;
    L.current = mapLayout;
    const sc = scrollRef.current;
    if (!sc || vp.current.w === 0 || was === mapLayout) return;
    cancelAnimationFrame(zoomAnim.current);
    heals.current = 0;
    if (mapLayout.mode === "filtered") {
      if (was.mode === "full") savedFull.current = { s: scale.current, left: sc.scrollLeft, top: sc.scrollTop };
      fitFiltered();
    } else if (was.mode === "filtered") {
      const saved = savedFull.current;
      scale.current = clampScale(saved?.s ?? DEFAULT_TILE_PX(vp.current.w) / TILE_SIZE);
      applySize(scale.current);
      sc.scrollLeft = saved?.left ?? 0;
      sc.scrollTop = saved?.top ?? 0;
    } else {
      scale.current = clampScale(scale.current);
      applySize(scale.current);
    }
    setTilePx(Math.round(TILE_SIZE * scale.current));
    // Replay the settle-in only when switching views or categories, not on every keystroke of a search.
    const focus = focusCategory?.slug ?? null;
    if (mapLayout.mode !== was.mode || focus !== lastFocus.current) {
      introDone.current = false;
      introStart.current = 0;
    }
    lastFocus.current = focus;
    schedule();
  }, [mapLayout, schedule]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- drawing --------------------------------------------------------------
  /** Mini-map: every tile as a dot, with the visible area outlined. */
  function drawMini(tx: number, ty: number, s: number, w: number, h: number, dark: boolean) {
    const mini = miniRef.current;
    if (!mini) return;
    const ctx = mini.getContext("2d");
    if (!ctx) return;
    const size = mini.clientWidth;
    if (!size) return;
    const dpr = vp.current.dpr;
    if (mini.width !== Math.round(size * dpr)) {
      mini.width = Math.round(size * dpr);
      mini.height = Math.round(size * dpr);
    }
    const lay = L.current;
    const k = size / Math.max(lay.width, lay.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    for (const it of lay.items) {
      ctx.fillStyle = (lens !== "category" && lensColor(it.entry, lens, dark)) || categoryColor(categoryIndex.get(it.colorSlug) ?? 0, dark);
      ctx.fillRect(it.x * k, it.y * k, Math.max(1, TILE_SIZE * k - 0.4), Math.max(1, TILE_SIZE * k - 0.4));
    }
    const vx = (-tx / s) * k;
    const vy = (-ty / s) * k;
    ctx.strokeStyle = dark ? "#fff" : "#14161f";
    ctx.lineWidth = 2;
    ctx.strokeRect(Math.max(1, vx), Math.max(1, vy), Math.min(size - 2, (w / s) * k), Math.min(size - 2, (h / s) * k));
  }

  const draw = useCallback(() => {
    frame.current = 0;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.dataset.draws = String(Number(canvas.dataset.draws || 0) + 1);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { w, h, dpr } = vp.current;
    const s = scale.current;
    const { tx, ty } = origin();
    const lay = L.current;
    const dark = darkRef.current;
    const css = getComputedStyle(canvas);
    const grout = css.getPropertyValue("--grout").trim() || (dark ? "#1b1f2a" : "#e2e5ec");
    const ink = css.getPropertyValue("--ink").trim() || (dark ? "#eef0f6" : "#14161f");
    const accent = css.getPropertyValue("--accent").trim() || "#3d3bff";
    const sponsor = css.getPropertyValue("--sponsor").trim() || "#b0177f";
    const muted = css.getPropertyValue("--muted").trim() || "#565d70";

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingQuality = "high";
    if (!lay.items.length) {
      drawMini(tx, ty, s, w, h, dark);
      return; // zero results: nothing behind the empty-state message
    }
    ctx.fillStyle = grout;
    roundRect(ctx, tx - 4, ty - 4, lay.width * s + 8, lay.height * s + 8, 10);
    ctx.fill();

    const tp = TILE_SIZE * s;
    const gap = tp < 5 ? 0 : Math.max(1, tp * 0.06);
    const tw = tp - gap;
    const visible = (x: number, y: number) => !(x > w || y > h || x + tp < 0 || y + tp < 0);

    // Unused cells of the full map get a faint texture so it reads as one mosaic.
    if (tp >= 6 && lay.mode === "full") {
      ctx.save();
      ctx.fillStyle = css.getPropertyValue("--panel").trim() || "#fff";
      ctx.globalAlpha = 0.45;
      const c0 = Math.max(0, Math.floor((-tx / s - 4) / TILE_SIZE));
      const c1 = Math.min(SLOTS_PER_ROW - 1, Math.floor((w - tx) / s / TILE_SIZE));
      const r0 = Math.max(0, Math.floor((-ty / s - 4) / TILE_SIZE));
      const r1 = Math.min(SLOTS_PER_ROW - 1, Math.floor((h - ty) / s / TILE_SIZE));
      for (let r = r0; r <= r1; r++)
        for (let c = c0; c <= c1; c++) {
          const slot = r * SLOTS_PER_ROW + c;
          if (bySlot.has(slot) || slot >= providerRegion.start) continue;
          const p = slotToPlacement("empty", slot);
          roundRect(ctx, tx + p.x * s, ty + p.y * s, tw, tw, Math.min(7, tp * 0.12));
          ctx.fill();
        }
      ctx.restore();
    }

    // Open slots in the provider band invite submissions (full map only).
    if (lay.openSlots)
      for (let slot = lay.openSlots.start; slot < lay.openSlots.end; slot++) {
        if (bySlot.has(slot)) continue;
        const p = slotToPlacement("open", slot);
        const x = tx + p.x * s;
        const y = ty + p.y * s;
        if (!visible(x, y)) continue;
        ctx.save();
        ctx.strokeStyle = muted;
        ctx.globalAlpha = 0.45;
        ctx.lineWidth = Math.max(1, tp * 0.03);
        if (tp >= 8) ctx.setLineDash([Math.max(2, tp * 0.1), Math.max(2, tp * 0.08)]);
        ctx.strokeRect(x + 1, y + 1, tw - 2, tw - 2);
        if (tp >= 18) {
          ctx.globalAlpha = 0.7;
          ctx.fillStyle = muted;
          ctx.font = `600 ${Math.round(tw * 0.42)}px ui-sans-serif, system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("+", x + tw / 2, y + tw * (tp >= DETAIL_PX ? 0.4 : 0.5));
          if (tp >= DETAIL_PX) {
            ctx.font = `600 ${Math.max(9, tw * 0.1)}px ui-sans-serif, system-ui, sans-serif`;
            ctx.fillText("Your API here", x + tw / 2, y + tw * 0.82);
          }
        }
        ctx.restore();
      }

    const now = performance.now();
    if (!introStart.current && entries.length) introStart.current = now;
    const introOn = !introDone.current && !reducedMotion();
    let introPending = false;
    const hoverItem = hoverRef.current ? lay.byId.get(hoverRef.current) : undefined;
    const spread = lay.mode === "full" ? 900 : 380;

    let monoInk = "#fff"; // letter colour for the tile being drawn
    const drawTile = (item: LayoutItem, x: number, y: number) => {
      const e = item.entry;
      const ci = categoryIndex.get(item.colorSlug) ?? 0;
      const seed = e.mark.type === "monogram" ? e.mark.seed : e.mark.type === "logo" ? e.mark.fallback.seed : 0;
      ctx.fillStyle = (lens !== "category" && lensColor(e, lens, dark, seed)) || tileColor(ci, seed, dark);
      monoInk = inkOn(String(ctx.fillStyle));
      if (tp >= 10) {
        roundRect(ctx, x, y, tw, tw, Math.min(7, tp * 0.12));
        ctx.fill();
      } else ctx.fillRect(x, y, tw, tw);

      if (tp >= LOGO_PX) drawIdentity(ctx, e, x, y, tw, tp);

      // Shape cues (not colour alone): sponsored → dashed frame + star; provider → diamond.
      if (e.sponsored && tp >= 8) {
        ctx.save();
        ctx.strokeStyle = sponsor;
        ctx.lineWidth = Math.max(1.5, tp * 0.05);
        ctx.setLineDash([Math.max(2, tp * 0.12), Math.max(2, tp * 0.08)]);
        ctx.strokeRect(x + 1, y + 1, tw - 2, tw - 2);
        ctx.restore();
      }
      if ((e.sponsored || e.source === "provider") && tp >= MONO_PX) {
        drawBadge(ctx, x + tw * 0.7, y + tw * 0.02, tw * 0.28, e.sponsored ? "star" : "diamond", e.sponsored ? sponsor : ink);
      }
      if (savedIds?.has(e.id) && tp >= 10) drawBadge(ctx, x + tw * 0.66, y + tw * 0.04, tw * (tp >= MONO_PX ? 0.3 : 0.5), "star", "#f2b134");
      if (newIds?.has(e.id) && tp >= MONO_PX) {
        const fs = Math.max(8, tw * 0.13);
        ctx.font = `800 ${fs}px ui-sans-serif, system-ui, sans-serif`;
        const label = "NEW";
        const lw = ctx.measureText(label).width + fs * 0.9;
        const lh = fs * 1.5;
        const lx = x + tw * 0.04;
        const ly = y + tw * (tp >= DETAIL_PX ? 0.58 : 0.04);
        ctx.fillStyle = "#16a37f";
        roundRect(ctx, lx, ly, lw, lh, lh / 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, lx + lw / 2, ly + lh / 2 + 0.5);
      }
      if (tp >= DETAIL_PX) {
        const glyph = glyphs[categoryGlyph.get(e.categorySlug) ?? ""];
        if (glyph) drawGlyph(ctx, glyph, x + tw * 0.06, y + tw * 0.06, tw * 0.2, "rgba(255,255,255,.92)");
        ctx.fillStyle = "rgba(0,0,0,.42)";
        ctx.fillRect(x, y + tw * 0.78, tw, tw * 0.22);
        ctx.fillStyle = "#fff";
        ctx.font = `600 ${Math.max(9, tw * 0.11)}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(fitText(ctx, e.name, tw * 0.94), x + tw / 2, y + tw * 0.89);
      }
    };

    // One tile that fails to draw (a bad image, say) must never blank the whole map.
    let failed: unknown = null;
    const safeTile = (item: LayoutItem, x: number, y: number) => {
      try {
        drawTile(item, x, y);
      } catch (err) {
        failed ??= err;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.globalAlpha = 1;
      }
    };
    let onScreen = 0;
    for (const item of lay.items) {
      const x = tx + item.x * s;
      const y = ty + item.y * s;
      if (!visible(x, y)) continue;
      onScreen++;
      if (introOn) {
        // Load-in ripple: tiles settle in a wave from the top-left corner.
        const delay = ((item.x + item.y) / (lay.width + lay.height)) * spread;
        const t = Math.min(1, Math.max(0, (now - introStart.current - delay) / 420));
        if (t < 1) introPending = true;
        if (t <= 0) continue;
        const k = 1 - Math.pow(1 - t, 3);
        ctx.save();
        ctx.globalAlpha = k;
        const cx = x + tw / 2;
        const cy = y + tw / 2;
        ctx.translate(cx, cy);
        ctx.scale(0.55 + 0.45 * k, 0.55 + 0.45 * k);
        ctx.translate(-cx, -cy);
        safeTile(item, x, y);
        ctx.restore();
        continue;
      }
      if (item === hoverItem) continue; // drawn last, lifted above its neighbours
      safeTile(item, x, y);
    }
    canvas.dataset.onScreen = String(onScreen);
    if (failed) {
      canvas.dataset.error = String((failed as Error)?.message ?? failed);
      console.error("[ApiWall] a tile could not be drawn:", failed);
    }
    // Self-check: filtered results must be on screen. If something left them out of view, re-fit.
    if (lay.mode === "filtered" && lay.items.length && onScreen === 0 && heals.current < 3) {
      heals.current++;
      requestAnimationFrame(() => {
        fitFiltered();
        schedule();
      });
    }
    if (introOn && !introPending && lay.items.length) introDone.current = true;
    if (introPending) schedule();

    // Hover lift: the tile under the pointer rises with a soft shadow.
    if (hoverItem && !introPending) {
      const x = tx + hoverItem.x * s;
      const y = ty + hoverItem.y * s;
      if (visible(x, y)) {
        const lift = tp >= LOGO_PX ? 1.14 : 1.35;
        const cx = x + tw / 2;
        const cy = y + tw / 2;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(lift, lift);
        ctx.translate(-cx, -cy);
        ctx.shadowColor = "rgba(0,0,0,.35)";
        ctx.shadowBlur = Math.max(6, tw * 0.25);
        ctx.shadowOffsetY = Math.max(2, tw * 0.06);
        ctx.fillStyle = grout;
        roundRect(ctx, x, y, tw, tw, Math.min(7, tp * 0.12));
        ctx.fill();
        ctx.shadowColor = "transparent";
        drawTile(hoverItem, x, y);
        ctx.restore();
      }
    }

    // Hover / keyboard focus / selection outlines.
    const outline = (id: string | null, color: string, width: number) => {
      const it = id ? lay.byId.get(id) : null;
      if (!it) return;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.strokeRect(tx + it.x * s - width / 2, ty + it.y * s - width / 2, tw + width, tw + width);
      ctx.restore();
    };
    outline(focusId, accent, 3);
    outline(selectedId, accent, 4);

    // Category labels where each band (or filtered group) starts, so you always know where you are.
    // Zoomed out on the full map: write each category's name across its band, like districts on a city map.
    const overview = lay.mode === "full" && tp < MONO_PX;
    if (overview) {
      const placed: [number, number, number, number][] = [];
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      for (const d of dists) {
        const bw = d.w * s;
        const bh = d.h * s;
        let size = Math.min(34, bh * 0.62);
        ctx.font = `800 ${size}px ui-rounded, "SF Pro Rounded", ui-sans-serif, system-ui, sans-serif`;
        const tw0 = ctx.measureText(d.name).width;
        if (tw0 > bw * 0.94) size *= (bw * 0.94) / tw0;
        if (size < 9) continue;
        ctx.font = `800 ${size}px ui-rounded, "SF Pro Rounded", ui-sans-serif, system-ui, sans-serif`;
        const textW = ctx.measureText(d.name).width;
        // Keep the whole name inside the band's box even when its centre of mass is off to one side.
        const left = tx + d.x0 * s;
        const right = left + d.w * s;
        const cx = Math.min(Math.max(tx + d.cx * s, left + textW / 2 + 4), right - textW / 2 - 4);
        const cy = ty + d.cy * s;
        const box: [number, number, number, number] = [cx - textW / 2 - 4, cy - size / 2 - 3, textW + 8, size + 6];
        if (box[0] > w || box[1] > h || box[0] + box[2] < 0 || box[1] + box[3] < 0) continue;
        if (placed.some(([ax, ay, aw, ah]) => box[0] < ax + aw && box[0] + box[2] > ax && box[1] < ay + ah && box[1] + box[3] > ay)) continue;
        placed.push(box);
        ctx.lineWidth = Math.max(3, size * 0.22);
        ctx.strokeStyle = "rgba(10,12,20,.62)";
        ctx.strokeText(d.name, cx, cy);
        ctx.fillStyle = "#fff";
        ctx.fillText(d.name, cx, cy);
      }
    }
    if (!overview) {
      const big = tp >= LABEL_MAX_PX;
      ctx.font = `600 ${big ? 12 : 11}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      const placed: [number, number, number, number][] = [];
      for (const r of lay.labels) {
        const p = slotXY(lay, r.slot);
        const lh = big ? 20 : 18;
        const lx = tx + p.x * s + (big ? 0 : 2);
        const ly = ty + p.y * s + (big ? -lh / 2 : 2);
        const lw = ctx.measureText(r.name).width + 14;
        if (lx > w || ly > h || lx + lw < 0 || ly + lh < 0) continue;
        if (placed.some(([ax, ay, aw, ah]) => lx < ax + aw && lx + lw > ax && ly < ay + ah && ly + lh > ay)) continue;
        placed.push([lx, ly, lw, lh]);
        ctx.fillStyle = dark ? "rgba(8,9,13,.88)" : "rgba(20,22,31,.86)";
        roundRect(ctx, lx, ly, lw, lh, lh / 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.fillText(r.name, lx + 7, ly + lh / 2 + 0.5);
      }
    }

    drawMini(tx, ty, s, w, h, dark);

    function drawIdentity(c: CanvasRenderingContext2D, e: Entry, x: number, y: number, tw: number, tp: number) {
      const m = e.mark;
      if (m.type === "logo") {
        const src = m.tile ?? m.src; // the small tile copy when there is one
        const img = imgCache.current.get(src);
        if (img === undefined) {
          const el = new Image();
          el.decoding = "async";
          el.onload = () => schedule();
          el.onerror = () => {
            imgCache.current.set(src, "error");
            schedule();
          };
          el.src = asset(src);
          imgCache.current.set(src, el);
        }
        if (img && img !== "error" && img.complete && img.naturalWidth > 0) {
          const inset = tp >= DETAIL_PX ? 0.2 : 0.12;
          const box = tw * (1 - inset * 2) * (tp >= DETAIL_PX ? 0.86 : 1);
          const bx = x + (tw - box) / 2;
          const by = y + (tp >= DETAIL_PX ? tw * 0.36 - box / 2 : (tw - box) / 2);
          c.fillStyle = "#fff";
          roundRect(c, bx, by, box, box, box * 0.16);
          c.fill();
          const pad = box * 0.12;
          const iw = img.naturalWidth;
          const ih = img.naturalHeight;
          const k = Math.min((box - 2 * pad) / iw, (box - 2 * pad) / ih);
          c.drawImage(img, bx + (box - iw * k) / 2, by + (box - ih * k) / 2, iw * k, ih * k);
          return;
        }
        return drawMonogram(c, m.fallback.text, m.fallback.seed, x, y, tw, tp);
      }
      if (m.type === "brand") {
        const box = tw * (tp >= DETAIL_PX ? 0.6 : 0.76);
        const bx = x + (tw - box) / 2;
        const by = y + (tp >= DETAIL_PX ? tw * 0.36 - box / 2 : (tw - box) / 2);
        c.fillStyle = "#fff";
        roundRect(c, bx, by, box, box, box * 0.16);
        c.fill();
        let path = pathCache.current.get(e.id);
        if (!path) {
          path = new Path2D(m.path);
          pathCache.current.set(e.id, path);
        }
        const k = (box * 0.64) / 24;
        c.save();
        c.translate(bx + box * 0.18, by + box * 0.18);
        c.scale(k, k);
        c.fillStyle = brandInk(m.hex);
        c.fill(path);
        c.restore();
        return;
      }
      drawMonogram(c, m.text, m.seed, x, y, tw, tp);
    }

    function drawMonogram(c: CanvasRenderingContext2D, text: string, seed: number, x: number, y: number, tw: number, tp: number) {
      // A seeded corner facet makes each monogram tile distinct within its band.
      const corner = seed % 4;
      const f = tw * (0.26 + ((seed >> 3) % 3) * 0.06);
      c.fillStyle = "rgba(255,255,255,.18)";
      c.beginPath();
      const cx = corner % 2 === 0 ? x : x + tw;
      const cy = corner < 2 ? y : y + tw;
      const dx = corner % 2 === 0 ? f : -f;
      const dy = corner < 2 ? f : -f;
      c.moveTo(cx, cy);
      c.lineTo(cx + dx, cy);
      c.lineTo(cx, cy + dy);
      c.closePath();
      c.fill();
      if (tp < MONO_PX) return;
      c.fillStyle = monoInk;
      c.font = `700 ${Math.round(tw * (tp >= DETAIL_PX ? 0.32 : 0.38))}px ui-rounded, "SF Pro Rounded", ui-sans-serif, system-ui, sans-serif`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(text, x + tw / 2, y + tw * (tp >= DETAIL_PX ? 0.42 : 0.53));
    }
  }, [mapLayout, dists, lens, savedIds, newIds, categoryIndex, categoryGlyph, glyphs, selectedId, focusId, schedule]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    drawRef.current = draw;
    schedule();
  }, [draw, schedule]);

  // The mini-map appears once the map outgrows the view; draw it as soon as it does.
  useEffect(() => {
    schedule();
  }, [mapLarger, schedule]);

  useImperativeHandle(ref, () => ({
    resetView,
    jumpTo: (slot: number) => {
      const sc = scrollRef.current;
      if (!sc || L.current.mode !== "full") return;
      if (TILE_SIZE * scale.current < MONO_PX) setScale(DEFAULT_TILE_PX(vp.current.w) / TILE_SIZE);
      const s = scale.current;
      const { ox, oy } = layout(s);
      const p = slotToPlacement("jump", slot);
      sc.scrollTo({
        left: ox + p.x * s - TILE_SIZE * s * 0.5,
        top: oy + p.y * s - TILE_SIZE * s * 0.5,
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      });
      sc.focus({ preventScroll: true });
    },
    focusEntry: (id: string) => {
      const e = byId.get(id)?.entry;
      if (e) {
        setFocusId(id);
        flyTo(e, MONO_PX);
      }
    },
  }));

  // ---- sizing ----------------------------------------------------------------
  useEffect(() => {
    const sc = scrollRef.current;
    const canvas = canvasRef.current;
    if (!sc || !canvas) return;
    darkRef.current = isDarkNow();
    const ro = new ResizeObserver(() => {
      const first = vp.current.w === 0;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      vp.current = { w: sc.clientWidth, h: sc.clientHeight, dpr };
      canvas.width = Math.round(sc.clientWidth * dpr);
      canvas.height = Math.round(sc.clientHeight * dpr);
      canvas.style.width = sc.clientWidth + "px";
      canvas.style.height = sc.clientHeight + "px";
      setArea({
        w: sc.clientWidth - insets.current.right,
        h: sc.clientHeight - insets.current.top - bottomUi(),
      });
      if (first) {
        // Open zoomed in, with marks and names visible, at the top-left of the map.
        scale.current = L.current.mode === "full" ? clampScale(DEFAULT_TILE_PX(sc.clientWidth) / TILE_SIZE) : clampScale(fitScale());
        applySize(scale.current);
        setTilePx(Math.round(TILE_SIZE * scale.current));
        sc.scrollLeft = 0;
        sc.scrollTop = 0;
      } else {
        scale.current = clampScale(scale.current);
        applySize(scale.current);
        setTilePx(Math.round(TILE_SIZE * scale.current));
      }
      schedule();
    });
    ro.observe(sc);
    const offTheme = onThemeChange(() => {
      darkRef.current = isDarkNow();
      schedule();
    });
    return () => {
      ro.disconnect();
      offTheme();
    };
  }, [schedule]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- input -----------------------------------------------------------------
  const local = (e: { clientX: number; clientY: number }) => {
    const r = scrollRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const hitTest = (px: number, py: number): { entry: Entry | null; open: boolean } => {
    const { tx, ty } = origin();
    const s = scale.current;
    const lay = L.current;
    const slot = cellToLayoutSlot(lay, (px - tx) / s, (py - ty) / s);
    if (slot < 0) return { entry: null, open: false };
    const entry = lay.bySlot.get(slot)?.entry ?? null;
    return {
      entry,
      open: !entry && !!lay.openSlots && slot >= lay.openSlots.start && slot < lay.openSlots.end,
    };
  };

  // Mouse: drag to pan. Touch and trackpads use native scrolling.
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    sl: number;
    st: number;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);

  const onPointerDown = (ev: React.PointerEvent<HTMLDivElement>) => {
    cancelAnimationFrame(flight.current); // a drag takes over from a running fly-to
    if (ev.pointerType !== "mouse" || ev.button !== 0) return;
    const sc = scrollRef.current!;
    const p = local(ev);
    if (p.x >= sc.clientWidth || p.y >= sc.clientHeight) return; // on a scrollbar
    drag.current = {
      id: ev.pointerId,
      x: ev.clientX,
      y: ev.clientY,
      sl: sc.scrollLeft,
      st: sc.scrollTop,
      moved: false,
    };
  };
  const onPointerMove = (ev: React.PointerEvent<HTMLDivElement>) => {
    const sc = scrollRef.current!;
    const d = drag.current;
    if (d && d.id === ev.pointerId) {
      const dx = ev.clientX - d.x;
      const dy = ev.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) > 4) {
        d.moved = true;
        sc.setPointerCapture(ev.pointerId);
        sc.classList.add("dragging");
        setHover(null);
      }
      if (d.moved) {
        sc.scrollLeft = d.sl - dx;
        sc.scrollTop = d.st - dy;
      }
      return;
    }
    if (ev.pointerType !== "mouse") return;
    const p = local(ev);
    const { entry, open } = hitTest(p.x, p.y);
    const id = entry?.id ?? null;
    if (id !== hoverRef.current) {
      hoverRef.current = id;
      schedule();
    }
    const spot = { x: p.x, y: p.y, flipX: p.x > vp.current.w - 330, flipY: p.y > vp.current.h - 210 };
    setHover(entry ? { kind: "entry", id: entry.id, ...spot } : open ? { kind: "open", ...spot } : null);
  };
  const endDrag = (ev: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== ev.pointerId) return;
    suppressClick.current = d.moved;
    drag.current = null;
    scrollRef.current?.classList.remove("dragging");
  };
  const onClick = (ev: React.MouseEvent<HTMLDivElement>) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    const p = local(ev);
    const { entry, open } = hitTest(p.x, p.y);
    if (entry) {
      setFocusId(entry.id);
      onSelect(entry.id);
    } else if (open) onOpenSlot();
  };

  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc) return;
    const onScroll = () => {
      schedule();
      if (hoverRef.current && !drag.current) {
        hoverRef.current = null;
        setHover(null);
      }
    };
    // Ctrl/⌘ + wheel (and trackpad pinch, which reports ctrlKey) zooms; plain wheel scrolls.
    const onWheel = (ev: WheelEvent) => {
      if (!(ev.ctrlKey || ev.metaKey)) return;
      ev.preventDefault();
      const p = local(ev);
      setScale(scale.current * Math.exp(-ev.deltaY * 0.0025), p.x, p.y);
    };
    // Two-finger pinch on touch screens.
    let pinch: { d: number; s: number } | null = null;
    const dist = (t: TouchList) => Math.hypot(t[0]!.clientX - t[1]!.clientX, t[0]!.clientY - t[1]!.clientY);
    const onTouchStart = (ev: TouchEvent) => {
      if (ev.touches.length === 2) pinch = { d: dist(ev.touches), s: scale.current };
    };
    const onTouchMove = (ev: TouchEvent) => {
      if (!pinch || ev.touches.length !== 2) return;
      ev.preventDefault();
      const mid = local({
        clientX: (ev.touches[0]!.clientX + ev.touches[1]!.clientX) / 2,
        clientY: (ev.touches[0]!.clientY + ev.touches[1]!.clientY) / 2,
      });
      setScale((pinch.s * dist(ev.touches)) / Math.max(1, pinch.d), mid.x, mid.y);
    };
    const onTouchEnd = (ev: TouchEvent) => {
      if (ev.touches.length < 2) pinch = null;
    };
    sc.addEventListener("scroll", onScroll, { passive: true });
    sc.addEventListener("wheel", onWheel, { passive: false });
    sc.addEventListener("touchstart", onTouchStart, { passive: true });
    sc.addEventListener("touchmove", onTouchMove, { passive: false });
    sc.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      sc.removeEventListener("scroll", onScroll);
      sc.removeEventListener("wheel", onWheel);
      sc.removeEventListener("touchstart", onTouchStart);
      sc.removeEventListener("touchmove", onTouchMove);
      sc.removeEventListener("touchend", onTouchEnd);
    };
  }, [schedule, setScale]);

  // Keyboard: arrows move between tiles, Enter/Space opens, +/− zoom, 0 overview.
  const nextFrom = (fromSlot: number, dir: "left" | "right" | "up" | "down"): Entry | null => {
    const { cols: nc, rows: nr } = mapLayout;
    const col = fromSlot % nc;
    const row = Math.floor(fromSlot / nc);
    if (dir === "right" || dir === "left") {
      const step = dir === "right" ? 1 : -1;
      for (let s = fromSlot + step; s >= 0 && s < nc * nr; s += step) {
        const it = bySlot.get(s);
        if (it) return it.entry;
      }
      return null;
    }
    const step = dir === "down" ? 1 : -1;
    for (let r = row + step; r >= 0 && r < nr; r += step) {
      for (let d = 0; d < nc; d++) {
        for (const c of d === 0 ? [col] : [col - d, col + d]) {
          if (c < 0 || c >= nc) continue;
          const it = bySlot.get(r * nc + c);
          if (it) return it.entry;
        }
      }
    }
    return null;
  };

  const onKeyDown = (ev: React.KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, "left" | "right" | "up" | "down"> = {
      ArrowLeft: "left",
      ArrowRight: "right",
      ArrowUp: "up",
      ArrowDown: "down",
    };
    const dir = keys[ev.key];
    if (dir) {
      ev.preventDefault();
      const current = focusId ? byId.get(focusId) : null;
      const first = [...bySlot.keys()].sort((a, b) => a - b)[0];
      const next = current ? nextFrom(current.slot, dir) : first !== undefined ? bySlot.get(first)!.entry : null;
      if (next) {
        setFocusId(next.id);
        reveal(next, MONO_PX);
        setAnnounce(`${next.name}, ${next.category}. Press Enter for details.`);
      }
      return;
    }
    if ((ev.key === "Enter" || ev.key === " ") && focusId) {
      ev.preventDefault();
      onSelect(focusId);
      return;
    }
    if (ev.key === "+" || ev.key === "=") {
      ev.preventDefault();
      zoomTo(scale.current * 1.5);
    } else if (ev.key === "-" || ev.key === "_") {
      ev.preventDefault();
      zoomTo(scale.current / 1.5);
    } else if (ev.key === "0") {
      ev.preventDefault();
      resetView();
    }
  };

  // Mini-map: click or drag to jump.
  const miniDrag = useRef(false);
  const jumpFromMini = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    const mini = miniRef.current!;
    const sc = scrollRef.current!;
    const r = mini.getBoundingClientRect();
    const span = Math.max(L.current.width, L.current.height);
    const cx = ((ev.clientX - r.left) / r.width) * span;
    const cy = ((ev.clientY - r.top) / r.height) * span;
    const s = scale.current;
    const { ox, oy } = layout(s);
    sc.scrollLeft = ox + cx * s - vp.current.w / 2;
    sc.scrollTop = oy + cy * s - vp.current.h / 2;
    schedule();
  };

  const hovered = hover?.kind === "entry" ? (byId.get(hover.id)?.entry ?? null) : null;
  const zoomLevel = tilePx >= DETAIL_PX ? "detail" : tilePx >= MONO_PX ? "identity" : "overview";
  const zoomText = `${Math.round((tilePx / DEFAULT_TILE_PX(1000)) * 100)}%`;

  return (
    <div
      className="mosaic"
      data-zoom={zoomLevel}
      data-larger={mapLarger ? "yes" : "no"}
      data-layout={mapLayout.mode}
      data-tile-count={mapLayout.items.length}
      data-labels={mapLayout.labels.map((l) => l.name).join("|")}
      // Filtered views expose the exact tile IDs drawn, so tests can compare map and list.
      data-tile-ids={mapLayout.mode === "filtered" ? mapLayout.items.map((i) => i.entry.id).join(" ") : undefined}
    >
      <div className="mosaic-stage" ref={stageRef}>
        <canvas ref={canvasRef} className="mosaic-canvas" aria-hidden="true" data-testid="mosaic-canvas" />
        <div
          ref={scrollRef}
          className="mosaic-scroller"
          tabIndex={0}
          role="application"
          aria-roledescription="API mosaic"
          aria-label={`Scrollable mosaic of ${mapLayout.items.length} API ${mapLayout.items.length === 1 ? "tile" : "tiles"}${focusCategory ? ` in ${focusCategory.name}` : filtered ? " matching the filters" : ""}. Scroll or drag to move around. Arrow keys move between tiles, Enter opens details, plus and minus zoom, 0 fits ${filtered ? "the results" : "the whole map"}. The list view offers the same content.`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onPointerLeave={() => {
            hoverRef.current = null;
            setHover(null);
            schedule();
          }}
          onClick={onClick}
          onDoubleClick={(ev) => {
            const p = local(ev);
            zoomTo(scale.current * 2, p.x, p.y);
          }}
          onKeyDown={onKeyDown}
          data-testid="mosaic"
        >
          <div ref={spacerRef} className="mosaic-spacer" />
        </div>

        {hover && (
          <div
            className={`mosaic-tip${hovered ? " is-card" : ""}`}
            style={{
              left: hover.flipX ? hover.x - 14 : hover.x + 14,
              top: hover.flipY ? hover.y - 14 : hover.y + 14,
              transform: `translate(${hover.flipX ? "-100%" : "0"}, ${hover.flipY ? "-100%" : "0"})`,
            }}
            role="presentation"
            data-testid="tile-preview"
          >
            {hovered ? (
              <>
                <strong>{hovered.name}</strong>
                <span className="tip-cat">
                  <i aria-hidden="true" style={{ background: categoryColor(categoryIndex.get(hovered.categorySlug) ?? 0, darkTheme) }} />
                  {hovered.category}
                  {hovered.kind === "mcp" ? " · MCP server" : ""}
                  {hovered.sponsored ? " · Sponsored" : hovered.source === "provider" ? " · Provider-submitted" : ""}
                </span>
                {hovered.description && <span className="tip-desc">{hovered.description}</span>}
                <span className="tip-chips">
                  <em>{TIP_AUTH[hovered.auth] ?? "Auth unknown"}</em>
                  {hovered.kind === "api" && <em>HTTPS {hovered.https === "unknown" ? "?" : hovered.https}</em>}
                  {hovered.kind === "api" && <em>CORS {hovered.cors === "unknown" ? "?" : hovered.cors}</em>}
                  {savedIds?.has(hovered.id) && <em className="tip-saved">★ Saved</em>}
                  {newIds?.has(hovered.id) && <em className="tip-new">New</em>}
                  {hovered.link.state === "unreachable" && <em className="tip-down">Docs link down</em>}
                </span>
                <span className="tip-foot">Click for details</span>
              </>
            ) : (
              <>
                <strong>Open tile</strong>
                <span>Click to place your API here</span>
              </>
            )}
          </div>
        )}
        {hint && (
          <div className="mosaic-hint" role="status">
            {hint}
          </div>
        )}

        <div className="mosaic-controls" aria-label="Map controls">
          <button type="button" onClick={() => zoomTo(scale.current / 1.5)} aria-label="Zoom out" title="Zoom out (−)">
            −
          </button>
          <span className="zoom-readout" aria-label={`Zoom ${zoomText}`} data-testid="zoom-readout">
            {zoomText}
          </span>
          <button type="button" onClick={() => zoomTo(scale.current * 1.5)} aria-label="Zoom in" title="Zoom in (+)">
            +
          </button>
          <button
            type="button"
            className="wide"
            onClick={() => {
              if (zoomLevel === "overview") {
                zoomTo(DEFAULT_TILE_PX(vp.current.w) / TILE_SIZE);
                setHint("Zoomed in. Scroll or drag to explore.");
                setTimeout(() => setHint(null), 1800);
              } else resetView();
            }}
            title={zoomLevel === "overview" ? "Zoom in until names and logos show" : filtered ? "Fit all results (0)" : "Show the whole map (0)"}
          >
            {zoomLevel === "overview" ? "Close-up" : filtered ? "Fit results" : "Whole map"}
          </button>
        </div>

        <canvas
          ref={miniRef}
          className="mosaic-mini"
          hidden={!mapLarger}
          aria-label="Mini-map. Click to jump to that part of the mosaic."
          role="img"
          onPointerDown={(ev) => {
            miniDrag.current = true;
            ev.currentTarget.setPointerCapture(ev.pointerId);
            jumpFromMini(ev);
          }}
          onPointerMove={(ev) => miniDrag.current && jumpFromMini(ev)}
          onPointerUp={() => (miniDrag.current = false)}
          onPointerCancel={() => (miniDrag.current = false)}
          data-testid="mosaic-mini"
        />
      </div>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
    </div>
  );
});

function fitText(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > max) t = t.slice(0, -1);
  return t + "…";
}

function drawGlyph(ctx: CanvasRenderingContext2D, paths: string[], x: number, y: number, size: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  const k = size / 24;
  ctx.scale(k, k);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const d of paths) ctx.stroke(new Path2D(d));
  ctx.restore();
}

function drawBadge(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, shape: "star" | "diamond", color: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = Math.max(1, size * 0.1);
  const cx = x + size / 2;
  const cy = y + size / 2;
  const r = size / 2;
  ctx.beginPath();
  if (shape === "star") {
    for (let i = 0; i < 10; i++) {
      const a = (Math.PI / 5) * i - Math.PI / 2;
      const rr = i % 2 === 0 ? r : r * 0.45;
      ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
  } else {
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r, cy);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r, cy);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
