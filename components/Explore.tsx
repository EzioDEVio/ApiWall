"use client";

import Link from "next/link";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CatalogSnapshot } from "@/lib/catalog/types";
import type { PublicProviderPayload } from "@/lib/providers/types";
import { ACCESS_LABELS, ACCESS_STATUSES } from "@/lib/providers/types";
import { buildEntries, categoryCounts, EMPTY_FILTERS, type Filters, filterEntries, isFiltered, NEW_DAYS, PROVIDER_CATEGORY_SLUG } from "@/lib/explore/model";
import { PROVIDER_REGION } from "@/lib/catalog/placement";
import { Mosaic, type MosaicHandle, type MosaicRegion } from "./Mosaic";
import { ListView } from "./ListView";
import { DetailDialog } from "./DetailDialog";
import { Glyph, IdentityMark } from "./IdentityMark";
import { rankSuggestions } from "@/lib/explore/suggest";
import { asset, STATIC_MODE } from "@/lib/site";
import { type BrowserCatalog, fromBrowserCatalog } from "@/lib/catalog/browser";
import { parseUrlState, toUrlSearch } from "@/lib/explore/urlState";
import { copyText } from "@/lib/clipboard";
import { isDarkNow, onThemeChange } from "@/lib/theme";
import { useSaved } from "@/lib/saved";
import { isRecent } from "@/lib/catalog/history";
import { LENS_IDS, LENSES, type LensId, lensCounts, lensSwatch } from "@/lib/explore/lenses";
import { CategoryNav, type CategoryRow } from "./CategoryNav";
import { CompareDialog } from "./CompareDialog";
import { CommandPalette } from "./CommandPalette";
import { MAX_COMPARE, toggleCompare } from "@/lib/explore/compare";
import type { PaletteAction, PaletteItem } from "@/lib/explore/palette";
import { applyTheme } from "@/lib/theme";

type Load<T> = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; data: T };

interface Props {
  glyphs: Record<string, string[]>;
  stats: { api: number; mcp: number };
}

const WELCOME_KEY = "tessera.welcome.dismissed";
const AI_SLUG = "ai-models";
const NARROW = "(max-width: 899px)";
const WIDE = "(min-width: 1100px)";
const PHONE = "(max-width: 640px)";

/** True while a modal dialog is open (the side panel is not modal, so shortcuts keep working). */
function modalOpen(): boolean {
  try {
    return !!document.querySelector("dialog:modal");
  } catch {
    return !!document.querySelector("dialog[open]");
  }
}

const KIND_LABELS: Record<string, string> = {
  api: "HTTP APIs",
  mcp: "MCP servers",
  provider: "Provider-submitted",
};
const AUTH_LABELS: Record<string, string> = {
  none: "No auth listed",
  apiKey: "API key",
  oauth: "OAuth",
  other: "Other / unknown",
};
const TRI_LABELS: Record<string, string> = {
  yes: "Yes",
  no: "No",
  unknown: "Unknown",
};
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

function readFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}
function writeFlag(key: string) {
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    /* private mode: the card simply shows again next time */
  }
}

/**
 * The Explore app: the mosaic fills the window and every control floats over
 * it. The page itself never scrolls, so scrolling always moves the map.
 */
export function Explore({ glyphs, stats }: Props) {
  const [catalog, setCatalog] = useState<Load<CatalogSnapshot>>({
    state: "loading",
  });
  const [providers, setProviders] = useState<Load<PublicProviderPayload>>({
    state: "loading",
  });
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [listOpen, setListOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [welcome, setWelcome] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dark, setDark] = useState(false);
  const [hudH, setHudH] = useState(120);
  const [narrow, setNarrow] = useState(false);
  const [wide, setWide] = useState(false);
  const [lens, setLens] = useState<LensId>("category");
  const [sharedList, setSharedList] = useState<string[] | null>(null);
  const [phone, setPhone] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const saved = useSaved();
  const [sugOpen, setSugOpen] = useState(false);
  const [sugIdx, setSugIdx] = useState(-1);
  const [navOpen, setNavOpen] = useState(false);
  const navBtn = useRef<HTMLButtonElement>(null);
  const [urlReady, setUrlReady] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const surpriseRef = useRef<(() => void) | null>(null);
  const mosaicRef = useRef<MosaicHandle>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const filtersBtn = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const deferredQ = useDeferredValue(filters.q);

  const loadCatalog = useCallback(() => {
    setCatalog({ state: "loading" });
    fetch(STATIC_MODE ? asset("/catalog.json") : "/api/catalog")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`The catalog could not be loaded (HTTP ${r.status}).`))))
      .then((data: BrowserCatalog | CatalogSnapshot) => setCatalog({ state: "ready", data: fromBrowserCatalog(data) }))
      .catch((e: Error) =>
        setCatalog({
          state: "error",
          message: e.message || "The catalog could not be loaded.",
        }),
      );
  }, []);

  useEffect(() => {
    loadCatalog();
    // The static site has no server: approved logos are part of the catalog, and there are no provider listings.
    (STATIC_MODE
      ? Promise.resolve({ listings: [], catalogClaims: [] })
      : fetch("/api/providers/public").then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    )
      .then((data: PublicProviderPayload) => setProviders({ state: "ready", data }))
      .catch(() =>
        setProviders({
          state: "error",
          message: "Provider listings are unavailable right now.",
        }),
      );
    // Phones open on readable cards; the map is one tap away.
    if (window.matchMedia("(max-width: 640px)").matches) setListOpen(true);
    if (!readFlag(WELCOME_KEY)) setWelcome(true);
    // Dark when the saved theme says so, or when following a dark system setting.
    setDark(isDarkNow());
    const offTheme = onThemeChange(() => setDark(isDarkNow()));
    // Shareable links: restore category, search, filters, view and the open API from the URL.
    const fromUrl = parseUrlState(window.location.search);
    setFilters(fromUrl.filters);
    if (fromUrl.view) setListOpen(fromUrl.view === "list");
    if (fromUrl.api) setSelectedId(fromUrl.api);
    if (fromUrl.lens) setLens(fromUrl.lens);
    if (fromUrl.list) setSharedList(fromUrl.list);
    if (fromUrl.compare) {
      setCompareIds(fromUrl.compare);
      if (fromUrl.compare.length >= 2) setCompareOpen(true); // a shared comparison opens ready to read
    }
    setUrlReady(true);
    // Below 900px the category list becomes a drawer opened from the top bar.
    // Wide windows show details in a side panel beside the map.
    const pq = window.matchMedia(PHONE);
    setPhone(pq.matches);
    const onPhone = () => setPhone(pq.matches);
    pq.addEventListener("change", onPhone);
    const wq = window.matchMedia(WIDE);
    setWide(wq.matches);
    const onWide = () => setWide(wq.matches);
    wq.addEventListener("change", onWide);
    const nq = window.matchMedia(NARROW);
    setNarrow(nq.matches);
    const onNarrow = () => setNarrow(nq.matches);
    nq.addEventListener("change", onNarrow);
    return () => {
      offTheme();
      wq.removeEventListener("change", onWide);
      pq.removeEventListener("change", onPhone);
      nq.removeEventListener("change", onNarrow);
    };
  }, [loadCatalog]);

  // Keep the address bar in step with what is on screen, so any view can be shared as a link.
  useEffect(() => {
    if (!urlReady) return;
    const search = toUrlSearch(
      { filters, view: listOpen ? "list" : null, api: selectedId, lens, list: sharedList, compare: compareIds },
      window.location.search,
    );
    if (search !== window.location.search) window.history.replaceState(null, "", window.location.pathname + search + window.location.hash);
  }, [urlReady, filters, listOpen, selectedId, lens, sharedList, compareIds]);

  // Ctrl+K / ⌘K opens the command palette from anywhere, even while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Shortcuts: "/" focuses search, "R" opens a random API. Ignored while typing or in a dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable='true']") || modalOpen()) return;
      if (e.key === "/") {
        e.preventDefault();
        document.getElementById("q")?.focus();
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        surpriseRef.current?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Keep map content clear of the floating top bar.
  useEffect(() => {
    const el = hudRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHudH(Math.round(el.getBoundingClientRect().height) + 12));
    ro.observe(el);
    return () => ro.disconnect();
  }, [catalog.state]);

  // Escape closes the topmost floating panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector("dialog[open]")) return;
      if (navOpen) {
        setNavOpen(false);
        navBtn.current?.focus();
      } else if (filtersOpen) {
        setFiltersOpen(false);
        filtersBtn.current?.focus();
      } else if (helpOpen) setHelpOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtersOpen, helpOpen, navOpen]);

  const snapshot = catalog.state === "ready" ? catalog.data : null;
  const providerData = providers.state === "ready" ? providers.data : null;

  const entries = useMemo(() => (snapshot ? buildEntries(snapshot, providerData) : []), [snapshot, providerData]);
  const byId = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);
  const effective = useMemo(() => ({ ...filters, q: deferredQ }), [filters, deferredQ]);
  // A shared list (?list=) or "Saved" narrows the pool first; everything else filters within it.
  const scoped = useMemo(() => {
    if (sharedList) {
      const ids = new Set(sharedList);
      return entries.filter((e) => ids.has(e.id));
    }
    if (filters.saved) return entries.filter((e) => saved.set.has(e.id));
    return entries;
  }, [entries, sharedList, filters.saved, saved.set]);
  // The single source of truth: map, list, counts and details all read `results`.
  const results = useMemo(() => filterEntries(scoped, effective), [scoped, effective]);
  const filtered = isFiltered(effective) || !!sharedList;
  const newCount = useMemo(() => {
    const now = Date.now();
    return entries.filter((e) => isRecent(e.addedAt, now, NEW_DAYS)).length;
  }, [entries]);
  const newIds = useMemo(() => {
    const now = Date.now();
    return new Set(entries.filter((e) => isRecent(e.addedAt, now, NEW_DAYS)).map((e) => e.id));
  }, [entries]);
  // Filters in the panel (category and search have their own controls).
  const panelFilters = (["kind", "auth", "https", "cors", "access", "logo"] as const).filter((k) => filters[k] !== "").length;

  const categories = useMemo(() => {
    if (!snapshot) return [];
    const list = snapshot.categories.map((c) => ({
      slug: c.slug,
      name: c.name,
      glyph: c.glyph,
    }));
    if (providerData?.listings.length)
      list.push({
        slug: PROVIDER_CATEGORY_SLUG,
        name: "Provider-submitted",
        glyph: "building-store",
      });
    return list;
  }, [snapshot, providerData]);
  const counts = useMemo(() => categoryCounts(scoped, effective), [scoped, effective]);
  const navRows: CategoryRow[] = useMemo(() => categories.map((c) => ({ ...c, count: counts.bySlug.get(c.slug) ?? 0 })), [categories, counts]);
  const focusCategory = useMemo(() => {
    const c = filters.category ? categories.find((x) => x.slug === filters.category) : null;
    return c ? { slug: c.slug, name: c.name } : null;
  }, [filters.category, categories]);
  const categoryIndex = useMemo(() => new Map(categories.map((c, i) => [c.slug, i])), [categories]);
  const categoryGlyph = useMemo(() => new Map(categories.map((c) => [c.slug, c.glyph])), [categories]);
  const regions: MosaicRegion[] = useMemo(() => {
    if (!snapshot) return [];
    const names = new Map(categories.map((c) => [c.slug, c.name]));
    const r = snapshot.regions.map((x) => ({
      ...x,
      name: names.get(x.slug) ?? x.slug,
    }));
    if (providerData?.listings.length)
      r.push({
        slug: PROVIDER_CATEGORY_SLUG,
        name: "Provider-submitted",
        start: PROVIDER_REGION.start,
        end: PROVIDER_REGION.end,
      });
    return r;
  }, [snapshot, categories, providerData]);

  const select = useCallback((id: string | null) => setSelectedId(id), []);
  const showToast = (text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  };
  // A link that opens exactly these APIs for anyone, as a "Shared list".
  const shareSaved = async () => {
    const url = new URL(window.location.href);
    url.search = toUrlSearch({ filters: EMPTY_FILTERS, view: null, api: null, list: saved.ids.slice(0, 100) });
    showToast((await copyText(url.toString())) ? `Link to your ${Math.min(saved.ids.length, 100)} saved APIs copied.` : "Copy failed.");
  };
  const toggleCmp = (id: string) => {
    const r = toggleCompare(compareIds, id);
    if (r.refused) showToast(`The comparison holds ${MAX_COMPARE} APIs. Remove one first.`);
    else setCompareIds(r.ids);
  };
  const copyLink = async () =>
    showToast((await copyText(window.location.href)) ? "Link copied. It opens this exact view." : "Copy failed. Copy the address bar instead.");

  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }));
  const resetAll = () => {
    setFilters(EMPTY_FILTERS);
    setFiltersOpen(false);
  };
  const chooseCategory = (slug: string) => {
    set("category", slug);
    if (narrow) {
      setNavOpen(false);
      navBtn.current?.focus();
    }
  };
  // Removable chips for every active criterion.
  const chips: { key: keyof Filters; label: string }[] = [];
  if (filters.category)
    chips.push({
      key: "category",
      label: `Category: ${focusCategory?.name ?? filters.category}`,
    });
  if (filters.q.trim()) chips.push({ key: "q", label: `Search: “${filters.q.trim()}”` });
  if (filters.kind) chips.push({ key: "kind", label: `Type: ${KIND_LABELS[filters.kind]}` });
  if (filters.auth) chips.push({ key: "auth", label: `Auth: ${AUTH_LABELS[filters.auth]}` });
  if (filters.https) chips.push({ key: "https", label: `HTTPS: ${TRI_LABELS[filters.https]}` });
  if (filters.cors) chips.push({ key: "cors", label: `CORS: ${TRI_LABELS[filters.cors]}` });
  if (filters.logo) chips.push({ key: "logo", label: filters.logo === "missing" ? "No logo yet" : "Has a logo" });
  if (filters.saved) chips.push({ key: "saved", label: "Saved APIs" });
  if (filters.fresh) chips.push({ key: "fresh", label: "New this week" });
  if (filters.access)
    chips.push({
      key: "access",
      label: `Access: ${ACCESS_LABELS[filters.access]}`,
    });
  const selected = selectedId ? (byId.get(selectedId) ?? null) : null;
  const dismissWelcome = () => {
    setWelcome(false);
    writeFlag(WELCOME_KEY);
  };

  if (catalog.state === "loading") {
    return (
      <section className="app-shell app-state" aria-busy="true">
        <div className="state-panel" role="status">
          <div className="loading-tiles" aria-hidden="true">
            {Array.from({ length: 12 }, (_, i) => (
              <span key={i} style={{ animationDelay: `${i * 70}ms` }} />
            ))}
          </div>
          <p>Laying out the mosaic…</p>
        </div>
      </section>
    );
  }
  if (catalog.state === "error" || !snapshot) {
    return (
      <section className="app-shell app-state">
        <div className="state-panel state-error" role="alert">
          <h2>The catalog didn&apos;t load</h2>
          <p>{catalog.state === "error" ? catalog.message : "Unknown error."} Check your connection and try again.</p>
          <button type="button" className="btn btn-primary" onClick={loadCatalog}>
            Try again
          </button>
        </div>
      </section>
    );
  }

  const total = entries.length;
  // Legend counts come from the visible results, so they always match the wall.
  // Each count ignores the lens's own filter, so it says what clicking that colour would show.
  const lensBuckets =
    lens === "category"
      ? new Map<string, number>()
      : lensCounts(
          filterEntries(scoped, { ...effective, ...Object.fromEntries(LENSES[lens].buckets.flatMap((b) => Object.keys(b.filter)).map((k) => [k, ""])) }),
          lens,
        );

  /** Opens a random API from the current results (so it respects category and filters). */
  const surprise = () => {
    const pool = results.length > 1 ? results.filter((e) => e.id !== selectedId) : results;
    if (!pool.length) return;
    const pick = pool[Math.floor(Math.random() * pool.length)]!;
    if (!listOpen) mosaicRef.current?.focusEntry(pick.id);
    select(pick.id);
  };
  surpriseRef.current = surprise;

  // ‹ › in the details step through the current results, and the map follows along.
  const selIndex = selectedId ? results.findIndex((e) => e.id === selectedId) : -1;
  const step = (d: number) => {
    if (selIndex < 0 || !results.length) return;
    const next = results[(selIndex + d + results.length) % results.length]!;
    if (!listOpen) mosaicRef.current?.focusEntry(next.id);
    select(next.id);
  };
  const detailNav = selIndex >= 0 ? { index: selIndex, total: results.length, prev: () => step(-1), next: () => step(1) } : null;

  // Search suggestions: the best matches among the current results.
  const suggestions = sugOpen && filters.q.trim() ? rankSuggestions(results, filters.q, 8) : [];
  const chooseSuggestion = (id: string) => {
    setSugOpen(false);
    setSugIdx(-1);
    if (!listOpen) mosaicRef.current?.focusEntry(id);
    select(id);
  };
  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!suggestions.length) return;
      e.preventDefault();
      setSugOpen(true);
      setSugIdx((i) => (e.key === "ArrowDown" ? (i + 1) % suggestions.length : (i <= 0 ? suggestions.length : i) - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (sugIdx >= 0 && suggestions[sugIdx]) chooseSuggestion(suggestions[sugIdx]!.id);
      else setSugOpen(false);
    } else if (e.key === "Escape" && sugOpen) {
      e.stopPropagation();
      setSugOpen(false);
      setSugIdx(-1);
    }
  };
  const src = snapshot.source;

  // Compared APIs in the order they were added (unknown IDs from old links are skipped).
  const compareEntries = compareIds.map((id) => byId.get(id)).filter((e): e is NonNullable<typeof e> => !!e);

  // Ctrl+K palette: everything you can do from the top bar, by name.
  const paletteActions: PaletteAction[] = [
    listOpen ? { id: "map", label: "Show the map", keywords: "wall view" } : { id: "list", label: "Show the list", keywords: "cards view" },
    { id: "saved", label: filters.saved ? "Show all APIs" : "Show saved APIs", keywords: "saved favourites favorites starred my list", hint: `${saved.ids.length} saved` },
    ...(newCount ? [{ id: "new", label: "Show New this week", keywords: "recent fresh added latest", hint: `${newCount} new` }] : []),
    ...(compareEntries.length >= 2 ? [{ id: "compare", label: "Open the comparison", keywords: "compare side by side", hint: `${compareEntries.length} APIs` }] : []),
    { id: "surprise", label: "Surprise me", keywords: "random dice", hint: "R" },
    ...(isFiltered(filters) || sharedList ? [{ id: "reset", label: "Reset filters", keywords: "clear all everything" }] : []),
    { id: "copy", label: "Copy link to this view", keywords: "share url" },
    { id: "theme-light", label: "Use the light theme", keywords: "theme appearance colour color mode" },
    { id: "theme-dark", label: "Use the dark theme", keywords: "theme appearance colour color mode night" },
    { id: "theme-system", label: "Follow the system theme", keywords: "theme appearance colour color mode auto" },
    { id: "changes", label: "Open What's new", keywords: "changelog changes sync" },
    { id: "submit", label: "Submit an API", keywords: "add place provider" },
    { id: "about", label: "Open About & Source", keywords: "about source license" },
  ];
  const onPalettePick = (it: PaletteItem) => {
    if (it.type === "api") {
      if (!listOpen && results.some((e) => e.id === it.entry.id)) mosaicRef.current?.focusEntry(it.entry.id);
      select(it.entry.id);
      return;
    }
    if (it.type === "category") {
      set("category", it.slug);
      setNavOpen(false);
      return;
    }
    switch (it.action.id) {
      case "map":
        return setListOpen(false);
      case "list":
        return setListOpen(true);
      case "saved":
        return set("saved", filters.saved ? "" : "yes");
      case "new":
        return set("fresh", "yes");
      case "compare":
        return setCompareOpen(true);
      case "surprise":
        return surprise();
      case "reset":
        setSharedList(null);
        return resetAll();
      case "copy":
        return void copyLink();
      case "theme-light":
        return applyTheme("light");
      case "theme-dark":
        return applyTheme("dark");
      case "theme-system":
        return applyTheme("system");
      case "changes":
        return router.push("/changes");
      case "submit":
        return router.push("/submit");
      case "about":
        return router.push("/about");
    }
  };

  return (
    <section
      className="app-shell"
      aria-label="Explore APIs"
      data-nav={narrow ? "drawer" : "sidebar"}
      data-side={wide && selected ? "open" : undefined}
      data-phone={phone ? "" : undefined}
      data-compare={compareIds.length ? "" : undefined}
      data-listview={listOpen ? "open" : undefined}
    >
      {(!narrow || navOpen) && (
        <CategoryNav
          rows={navRows}
          allCount={counts.all}
          aiSlug={AI_SLUG}
          active={filters.category}
          onChoose={chooseCategory}
          categoryIndex={categoryIndex}
          glyphs={glyphs}
          dark={dark}
          drawer={narrow}
          onClose={() => {
            setNavOpen(false);
            navBtn.current?.focus();
          }}
          lists={[
            { key: "saved", label: "Saved", count: saved.ids.length, on: !!filters.saved, toggle: () => set("saved", filters.saved ? "" : "yes") },
            ...(newCount
              ? [
                  {
                    key: "fresh" as const,
                    label: "New this week",
                    count: newCount,
                    on: !!filters.fresh,
                    toggle: () => set("fresh", filters.fresh ? "" : "yes"),
                  },
                ]
              : []),
          ]}
          onOpenTiles={
            filtered
              ? null
              : () => {
                  setListOpen(false);
                  if (narrow) setNavOpen(false);
                  mosaicRef.current?.jumpTo(PROVIDER_REGION.start);
                }
          }
        />
      )}
      {narrow && navOpen && <div className="nav-scrim" aria-hidden="true" onClick={() => setNavOpen(false)} />}
      <div className="app-main">
        <Mosaic
          ref={mosaicRef}
          entries={results}
          filtered={filtered}
          focusCategory={focusCategory}
          lens={lens}
          savedIds={saved.set}
          newIds={newIds}
          insetBottom={phone ? 60 : 0}
          categoryIndex={categoryIndex}
          categoryGlyph={categoryGlyph}
          glyphs={glyphs}
          regions={regions}
          providerRegion={PROVIDER_REGION}
          selectedId={selectedId}
          onSelect={(id) => select(id)}
          onOpenSlot={() => router.push("/submit")}
          insetTop={hudH}
          insetRight={listOpen ? 440 : wide && selectedId ? 484 : 0}
        />

        {/* Floating top bar: search, filters, view, categories. */}
        <div className="hud" ref={hudRef}>
          <form className="hud-bar glass" role="search" onSubmit={(e) => e.preventDefault()}>
            {narrow && (
              <button
                ref={navBtn}
                type="button"
                className={"hud-btn" + (filters.category ? " is-on" : "")}
                aria-expanded={navOpen}
                aria-controls="category-nav"
                onClick={() => {
                  setNavOpen((v) => !v);
                  setFiltersOpen(false);
                  setHelpOpen(false);
                }}
              >
                <Glyph paths={["M4 6h16", "M4 12h16", "M4 18h16"]} size={16} />
                <span className="sr-only">Categories</span>
                <span aria-hidden="true" className="nav-btn-label">
                  {focusCategory ? focusCategory.name : "Categories"}
                </span>
              </button>
            )}
            <label htmlFor="q" className="sr-only">
              Search APIs by name or description
            </label>
            <span className="search-icon" aria-hidden="true">
              <Glyph paths={["M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0", "M21 21l-6 -6"]} size={18} />
            </span>
            <input
              id="q"
              type="search"
              placeholder={`Search ${total.toLocaleString("en")} APIs`}
              value={filters.q}
              onChange={(e) => {
                set("q", e.target.value);
                setSugOpen(true);
                setSugIdx(-1);
              }}
              onFocus={() => setSugOpen(true)}
              onBlur={() => setSugOpen(false)}
              onKeyDown={onSearchKey}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={suggestions.length > 0}
              aria-controls="q-suggest"
              aria-activedescendant={sugIdx >= 0 && suggestions[sugIdx] ? `sug-${sugIdx}` : undefined}
              autoComplete="off"
            />
            <button
              ref={filtersBtn}
              type="button"
              className={"hud-btn" + (panelFilters ? " is-on" : "")}
              aria-expanded={filtersOpen}
              aria-controls="filters-panel"
              onClick={() => {
                setFiltersOpen((v) => !v);
                setHelpOpen(false);
              }}
            >
              Filters
              {panelFilters ? <span className="badge">{panelFilters}</span> : null}
            </button>
            <div className="segmented" role="group" aria-label="View">
              <button type="button" aria-pressed={!listOpen} onClick={() => setListOpen(false)}>
                Map
              </button>
              <button type="button" aria-pressed={listOpen} onClick={() => setListOpen(true)}>
                List
              </button>
            </div>
            <button
              type="button"
              className="hud-btn surprise-btn"
              onClick={surprise}
              disabled={!results.length}
              title="Open a random API from the current results (R)"
              data-testid="surprise"
            >
              <Glyph
                paths={[
                  "M3 5a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z",
                  "M8.5 8.5v.01",
                  "M15.5 8.5v.01",
                  "M12 12v.01",
                  "M8.5 15.5v.01",
                  "M15.5 15.5v.01",
                ]}
                size={18}
              />
              <span className="surprise-label">Surprise me</span>
            </button>
            <label className={"hud-btn lens-select" + (lens !== "category" ? " is-on" : "")} title="Colour the wall by a fact instead of by category">
              <Glyph
                paths={[
                  "M12 21a9 9 0 0 1 0 -18c4.97 0 9 3.582 9 8c0 1.06 -.474 2.078 -1.318 2.828c-.844 .75 -1.989 1.172 -3.182 1.172h-2.5a2 2 0 0 0 -1 3.75a1.3 1.3 0 0 1 -1 2.25",
                  "M8.5 10.5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
                  "M12.5 7.5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
                  "M16.5 10.5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
                ]}
                size={17}
              />
              <span className="lens-label">Color</span>
              <select aria-label="Color the wall by" value={lens} onChange={(e) => setLens(e.target.value as LensId)} data-testid="lens-select">
                {LENS_IDS.map((id) => (
                  <option key={id} value={id}>
                    {LENSES[id].label}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="hud-btn hud-icon" aria-label="How to explore" aria-expanded={helpOpen} onClick={() => setHelpOpen((v) => !v)}>
              ?
            </button>
            <button
              type="button"
              className="hud-btn palette-btn"
              aria-label="Jump to anything (Ctrl+K)"
              aria-keyshortcuts="Control+K Meta+K"
              title="Jump to an API, a category or an action (Ctrl+K)"
              onClick={() => setPaletteOpen(true)}
              data-testid="palette-open"
            >
              <kbd aria-hidden="true">Ctrl K</kbd>
            </button>
          </form>
          {sharedList && (
            <div className="list-banner glass" role="group" aria-label="Shared list" data-testid="shared-list">
              <span>
                <strong>Shared list</strong> · {scoped.length.toLocaleString("en")} {scoped.length === 1 ? "API" : "APIs"}
              </span>
              <button
                type="button"
                className="btn btn-small"
                onClick={() => {
                  saved.addMany(sharedList);
                  showToast(`Saved ${sharedList.length} APIs to your list.`);
                }}
              >
                ★ Save all
              </button>
              <button type="button" className="btn btn-small btn-quiet" onClick={() => setSharedList(null)}>
                Close list
              </button>
            </div>
          )}
          {!sharedList && filters.saved && saved.ids.length > 0 && (
            <div className="list-banner glass" role="group" aria-label="Your saved APIs" data-testid="saved-banner">
              <span>
                <strong>Your saved APIs</strong> · kept in this browser
              </span>
              <button type="button" className="btn btn-small" onClick={shareSaved} data-testid="share-saved">
                Copy share link
              </button>
            </div>
          )}
          {lens !== "category" && (
            <div className="lens-legend glass" role="group" aria-label={`${LENSES[lens].label} colours`} data-testid="lens-legend">
              <span className="lens-q">{LENSES[lens].question}</span>
              {LENSES[lens].buckets.map((b) => {
                const n = lensBuckets.get(b.key) ?? 0;
                const active = Object.entries(b.filter).every(([k, v]) => filters[k as keyof Filters] === v);
                return (
                  <button
                    key={b.key}
                    type="button"
                    className="lens-item"
                    aria-pressed={active}
                    aria-label={`${active ? "Showing" : "Show"} only ${b.label}: ${n.toLocaleString("en")}`}
                    onClick={() =>
                      setFilters((f) => (active ? { ...f, ...Object.fromEntries(Object.keys(b.filter).map((k) => [k, ""])) } : { ...f, ...b.filter }))
                    }
                  >
                    <i style={{ background: lensSwatch(b, dark) }} aria-hidden="true" />
                    {b.label}
                    <small>{n.toLocaleString("en")}</small>
                  </button>
                );
              })}
              <button type="button" className="lens-item lens-off" onClick={() => setLens("category")}>
                Back to categories
              </button>
            </div>
          )}
          {chips.length > 0 && (
            <div className="active-filters" role="group" aria-label="Active filters" data-testid="active-filters">
              {chips.map((c) => (
                <span key={c.key} className="filter-chip glass">
                  <span>{c.label}</span>
                  <button type="button" aria-label={`Remove ${c.label}`} onClick={() => set(c.key, "" as never)}>
                    ×
                  </button>
                </span>
              ))}
              <button type="button" className="filter-chip filter-reset glass" onClick={resetAll}>
                Reset filters
              </button>
            </div>
          )}
        </div>

        {suggestions.length > 0 && (
          <ul id="q-suggest" role="listbox" aria-label="Suggestions" className="suggest glass" data-testid="suggestions" style={{ top: hudH - 4 }}>
            {suggestions.map((e, i) => (
              <li
                key={e.id}
                id={`sug-${i}`}
                role="option"
                aria-selected={i === sugIdx}
                // mousedown, not click: the input's blur would close the list first.
                onMouseDown={(ev) => {
                  ev.preventDefault();
                  chooseSuggestion(e.id);
                }}
                onMouseEnter={() => setSugIdx(i)}
              >
                <IdentityMark mark={e.mark} name={e.name} categoryIndex={categoryIndex.get(e.categorySlug) ?? 0} size={30} dark={dark} />
                <span className="sug-main">
                  <span className="sug-name">{e.name}</span>
                  <span className="sug-cat">
                    {e.category}
                    {e.kind === "mcp" ? " · MCP" : ""}
                  </span>
                </span>
              </li>
            ))}
            <li className="sug-foot" role="presentation">
              {results.length.toLocaleString("en")} {results.length === 1 ? "match" : "matches"} on the wall · ↑↓ to choose · Enter to open
            </li>
          </ul>
        )}

        {filtersOpen && (
          <div
            className="float-panel filters-panel glass"
            id="filters-panel"
            role="group"
            aria-label="Filters"
            style={{ top: hudH - 4, maxHeight: phone ? `calc(100% - ${hudH + 80}px)` : undefined, overflowY: phone ? "auto" : undefined }}
          >
            <div className="filters-grid">
              <Select id="f-kind" label="Type" value={filters.kind} onChange={(v) => set("kind", v as Filters["kind"])}>
                <option value="">All types</option>
                <option value="api">HTTP APIs</option>
                <option value="mcp">MCP servers</option>
                <option value="provider">Provider-submitted</option>
              </Select>
              <Select id="f-auth" label="Authentication" value={filters.auth} onChange={(v) => set("auth", v as Filters["auth"])}>
                <option value="">Any</option>
                <option value="none">No auth listed</option>
                <option value="apiKey">API key</option>
                <option value="oauth">OAuth</option>
                <option value="other">Other / unknown</option>
              </Select>
              <Select id="f-https" label="HTTPS" value={filters.https} onChange={(v) => set("https", v as Filters["https"])}>
                <option value="">Any</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
                <option value="unknown">Unknown</option>
              </Select>
              <Select id="f-cors" label="CORS" value={filters.cors} onChange={(v) => set("cors", v as Filters["cors"])}>
                <option value="">Any</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
                <option value="unknown">Unknown</option>
              </Select>
              <Select id="f-access" label="Verified access" value={filters.access} onChange={(v) => set("access", v as Filters["access"])}>
                <option value="">Any</option>
                {ACCESS_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {ACCESS_LABELS[s]}
                  </option>
                ))}
              </Select>
              <Select id="f-logo" label="Logo" value={filters.logo} onChange={(v) => set("logo", v as Filters["logo"])}>
                <option value="">Any</option>
                <option value="has">Has a logo</option>
                <option value="missing">No logo yet (you can suggest one)</option>
              </Select>
            </div>
            <div className="row">
              <button type="button" className="btn btn-quiet" onClick={resetAll} disabled={!isFiltered(filters)}>
                Reset filters
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setFiltersOpen(false)}>
                Show {results.length.toLocaleString("en")} {results.length === 1 ? "listing" : "listings"}
              </button>
            </div>
          </div>
        )}

        {helpOpen && (
          <div className="float-panel help-panel glass" role="note" aria-label="How to explore" style={{ top: hudH - 4 }}>
            <ul>
              <li>
                <strong>Move:</strong> scroll in any direction, drag with the mouse, or swipe. The mini-map shows where you are; click it to jump.
              </li>
              <li>
                <strong>Zoom:</strong> + and −, Ctrl/⌘ + scroll, pinch, or double-click. <strong>Whole map</strong> fits everything.
              </li>
              <li>
                <strong>Categories:</strong> pick one in the {narrow ? "Categories menu" : "list on the left"} to show only its listings.{" "}
                <strong>All APIs</strong> shows everything again.
              </li>
              <li>
                <strong>Select:</strong> click or tap a tile, or focus the map and use the arrow keys and Enter.
              </li>
              <li>
                <strong>Search and filter:</strong> the map and the list both show only the matches, packed together; clearing them brings back the full map
                where you left it.
              </li>
              <li>
                <strong>Color:</strong> recolour the wall by auth, HTTPS, CORS or logo. Click a colour in the legend to show only those APIs.
              </li>
              <li>
                <strong>Shortcuts:</strong> <kbd>Ctrl</kbd>+<kbd>K</kbd> (<kbd>⌘</kbd>+<kbd>K</kbd> on a Mac) jump to anything, <kbd>/</kbd> search,{" "}
                <kbd>R</kbd> surprise me, <kbd>Esc</kbd> close. <strong>Copy link</strong> in the bottom bar
                shares exactly what you see.
              </li>
              <li>
                <strong>Compare:</strong> open an API and press <strong>⇄ Compare</strong>; add up to {MAX_COMPARE} and compare them side by side.
              </li>
              <li>
                <strong>Legend:</strong> ★ with a dashed frame is sponsored; ◆ is provider-submitted; dashed + tiles at the bottom are open for providers.
              </li>
            </ul>
          </div>
        )}

        {listOpen && (
          <aside className="list-drawer glass" aria-label="Listings" data-testid="list-drawer" style={{ top: hudH }}>
            <header className="drawer-head">
              <p className="count" aria-live="polite">
                <strong>{results.length.toLocaleString("en")}</strong> {results.length === 1 ? "listing" : "listings"}
              </p>
              <button type="button" className="btn btn-quiet" onClick={() => setListOpen(false)}>
                Show map
              </button>
            </header>
            {results.length > 0 ? (
              <ListView
                entries={results}
                categoryIndex={categoryIndex}
                categoryGlyph={categoryGlyph}
                glyphs={glyphs}
                onSelect={(id) => select(id)}
                dark={dark}
                savedIds={saved.set}
                newIds={newIds}
                onToggleSave={saved.toggle}
              />
            ) : null}
          </aside>
        )}

        {results.length === 0 && filters.saved && saved.ids.length === 0 && !sharedList && (
          <div className="float-panel no-results glass" role="status" data-testid="no-saved">
            <h3>No saved APIs yet</h3>
            <p>Open any API and press ☆ Save. Saved APIs stay in this browser, and you can share them all as one link.</p>
            <div className="row">
              <button type="button" className="btn btn-primary" onClick={() => set("saved", "")}>
                Back to all APIs
              </button>
            </div>
          </div>
        )}
        {results.length === 0 && !(filters.saved && saved.ids.length === 0 && !sharedList) && (
          <div className="float-panel no-results glass" role="status" data-testid="no-results">
            <h3>No listings match</h3>
            <p>
              {effective.q.trim() ? (
                <>
                  Nothing matches <strong>“{effective.q.trim()}”</strong>
                  {chips.some((c) => c.key !== "q") ? " with the other active filters" : ""}.
                </>
              ) : (
                "Nothing matches this combination of filters."
              )}{" "}
              {chips.length > 1 ? "Remove a filter or reset them all." : "Try a different search."}
            </p>
            {chips.length > 0 && (
              <ul className="no-results-chips" aria-label="Active filters">
                {chips.map((c) => (
                  <li key={c.key}>{c.label}</li>
                ))}
              </ul>
            )}
            <div className="row">
              {filters.q && (
                <button type="button" className="btn" onClick={() => set("q", "")}>
                  Clear search
                </button>
              )}
              <button type="button" className="btn btn-primary" onClick={resetAll}>
                Reset filters
              </button>
            </div>
          </div>
        )}

        {welcome && !listOpen && (
          <aside className="welcome glass" aria-labelledby="welcome-h" data-testid="welcome">
            <button type="button" className="welcome-close" aria-label="Close welcome" onClick={dismissWelcome}>
              ×
            </button>
            <p className="eyebrow">A million-cell map of public APIs</p>
            <h2 id="welcome-h">Your API. One tile. Millions of builders.</h2>
            <p>
              Each tile is one of {stats.api.toLocaleString("en")} public APIs or {stats.mcp} MCP servers from the community catalog, plus a small,
              source-checked AI Models list curated by ApiWall. Scroll anywhere, search, and open a tile for its auth, HTTPS and CORS details and the official
              docs.
            </p>
            <div className="row">
              <button type="button" className="btn btn-primary" onClick={dismissWelcome}>
                Start exploring
              </button>
              <Link href="/submit" className="btn">
                Place your API
              </Link>
            </div>
            <p className="key-warning">
              <strong>Never submit a secret here.</strong> We will contact verified providers about secure setup.
            </p>
          </aside>
        )}

        {phone && (
          <nav className="tabbar glass" aria-label="Views" data-testid="tabbar">
            <button
              type="button"
              aria-pressed={!listOpen}
              onClick={() => {
                setListOpen(false);
                setNavOpen(false);
              }}
            >
              <Glyph paths={["M3 7l6 -3l6 3l6 -3v13l-6 3l-6 -3l-6 3v-13", "M9 4v13", "M15 7v13"]} size={20} />
              <span>Map</span>
            </button>
            <button
              type="button"
              aria-pressed={listOpen}
              onClick={() => {
                setListOpen(true);
                setNavOpen(false);
              }}
            >
              <Glyph paths={["M9 6l11 0", "M9 12l11 0", "M9 18l11 0", "M5 6l0 .01", "M5 12l0 .01", "M5 18l0 .01"]} size={20} />
              <span>List</span>
            </button>
            <button type="button" aria-expanded={navOpen} aria-controls="category-nav" onClick={() => setNavOpen((v) => !v)}>
              <Glyph paths={["M4 4h6v6h-6z", "M14 4h6v6h-6z", "M4 14h6v6h-6z", "M14 14h6v6h-6z"]} size={20} />
              <span>Categories</span>
            </button>
            <button
              type="button"
              aria-pressed={!!filters.saved}
              onClick={() => {
                set("saved", filters.saved ? "" : "yes");
                setNavOpen(false);
              }}
            >
              <span className="tab-star" aria-hidden="true">
                {filters.saved ? "★" : "☆"}
              </span>
              <span>Saved</span>
              {saved.ids.length > 0 && (
                <span className="tab-badge" aria-hidden="true">
                  {saved.ids.length}
                </span>
              )}
            </button>
          </nav>
        )}

        {compareIds.length > 0 && (
          <div className="compare-tray glass" role="group" aria-label="APIs to compare" data-testid="compare-tray">
            <span className="tray-label">
              To compare<span className="tray-n">: {compareEntries.length} of {MAX_COMPARE}</span>
            </span>
            <ul>
              {compareEntries.map((e) => (
                <li key={e.id} className="tray-chip">
                  <IdentityMark mark={e.mark} name={e.name} categoryIndex={categoryIndex.get(e.categorySlug) ?? 0} size={22} dark={dark} />
                  <span>{e.name}</span>
                  <button type="button" aria-label={`Remove ${e.name} from comparison`} onClick={() => setCompareIds((ids) => ids.filter((x) => x !== e.id))}>
                    ×
                  </button>
                </li>
              ))}
              {Array.from({ length: Math.max(0, 2 - compareEntries.length) }, (_, i) => (
                <li key={`slot-${i}`} className="tray-slot" aria-hidden="true">
                  + add one
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="btn btn-primary btn-small"
              disabled={compareEntries.length < 2}
              onClick={() => setCompareOpen(true)}
              data-testid="compare-open"
            >
              Compare {compareEntries.length}
            </button>
            <button type="button" className="btn btn-small btn-quiet" onClick={() => setCompareIds([])}>
              Clear
            </button>
          </div>
        )}

        {toast && (
          <div className="toast glass" role="status" data-testid="toast">
            {toast}
          </div>
        )}

        <footer className="status-bar glass">
          <span className="count" data-testid="result-count">
            <strong>{results.length.toLocaleString("en")}</strong> of {total.toLocaleString("en")} {total === 1 ? "listing" : "listings"}
            {focusCategory ? <span className="count-cat"> in {focusCategory.name}</span> : null}
          </span>
          {isFiltered(filters) && (
            <button type="button" className="linkish" onClick={resetAll}>
              Reset filters
            </button>
          )}
          <button type="button" className="linkish" onClick={copyLink} data-testid="copy-link">
            Copy link
          </button>
          <span className="sync" title={`README sha256 ${src.contentSha256}`}>
            <span className="dot" aria-hidden="true" />
            Snapshot {src.commit ? src.commit.slice(0, 7) : src.contentSha256.slice(0, 7)}
            <span className="sync-date"> · {fmtDate(src.importedAt)}</span>
          </span>
          <span className="notice-mini">
            Community-sourced from public-apis. Confirm terms with each provider. <Link href="/about">About</Link>
          </span>
          {providers.state === "error" && <span className="muted">Provider listings unavailable.</span>}
        </footer>

        <DetailDialog
          entry={selected}
          onClose={() => select(null)}
          source={src}
          categoryIndex={selected ? (categoryIndex.get(selected.categorySlug) ?? 0) : 0}
          glyph={selected ? glyphs[categoryGlyph.get(selected.categorySlug) ?? ""] : undefined}
          dark={dark}
          mode={wide ? "side" : phone ? "sheet" : "modal"}
          nav={detailNav}
          saved={selected ? saved.set.has(selected.id) : false}
          onToggleSave={selected ? () => saved.toggle(selected.id) : undefined}
          isNew={selected ? newIds.has(selected.id) : false}
          compared={selected ? compareIds.includes(selected.id) : false}
          compareFull={compareIds.length >= MAX_COMPARE}
          onToggleCompare={selected ? () => toggleCmp(selected.id) : undefined}
        />

        <CompareDialog
          open={compareOpen}
          entries={compareEntries}
          categoryIndex={categoryIndex}
          dark={dark}
          onClose={() => setCompareOpen(false)}
          onRemove={(id) => setCompareIds((ids) => ids.filter((x) => x !== id))}
          onOpenDetails={(id) => {
            setCompareOpen(false);
            select(id);
          }}
          onCopyLink={copyLink}
        />

        <CommandPalette
          open={paletteOpen}
          entries={entries}
          categories={navRows}
          actions={paletteActions}
          categoryIndex={categoryIndex}
          dark={dark}
          onClose={() => setPaletteOpen(false)}
          onPick={onPalettePick}
        />
      </div>
    </section>
  );
}

function Select({
  id,
  label,
  value,
  onChange,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <span className="select field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </span>
  );
}
