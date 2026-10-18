"use client";

import Link from "next/link";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CatalogSnapshot } from "@/lib/catalog/types";
import type { PublicProviderPayload } from "@/lib/providers/types";
import { ACCESS_LABELS, ACCESS_STATUSES } from "@/lib/providers/types";
import { buildEntries, categoryCounts, EMPTY_FILTERS, type Filters, filterEntries, isFiltered, PROVIDER_CATEGORY_SLUG } from "@/lib/explore/model";
import { PROVIDER_REGION } from "@/lib/catalog/placement";
import { Mosaic, type MosaicHandle, type MosaicRegion } from "./Mosaic";
import { ListView } from "./ListView";
import { DetailDialog } from "./DetailDialog";
import { Glyph } from "./IdentityMark";
import { asset, STATIC_MODE } from "@/lib/site";
import { parseUrlState, toUrlSearch } from "@/lib/explore/urlState";
import { copyText } from "@/lib/clipboard";
import { CategoryNav, type CategoryRow } from "./CategoryNav";

type Load<T> = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; data: T };

interface Props {
  glyphs: Record<string, string[]>;
  stats: { api: number; mcp: number };
}

const WELCOME_KEY = "tessera.welcome.dismissed";
const AI_SLUG = "ai-models";
const NARROW = "(max-width: 899px)";

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
      .then((data: CatalogSnapshot) => setCatalog({ state: "ready", data }))
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
    (STATIC_MODE ? Promise.resolve({ listings: [], catalogClaims: [] }) : fetch("/api/providers/public").then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))))
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
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setDark(mq.matches);
    const on = () => setDark(mq.matches);
    mq.addEventListener("change", on);
    // Shareable links: restore category, search, filters, view and the open API from the URL.
    const fromUrl = parseUrlState(window.location.search);
    setFilters(fromUrl.filters);
    if (fromUrl.view) setListOpen(fromUrl.view === "list");
    if (fromUrl.api) setSelectedId(fromUrl.api);
    setUrlReady(true);
    // Below 900px the category list becomes a drawer opened from the top bar.
    const nq = window.matchMedia(NARROW);
    setNarrow(nq.matches);
    const onNarrow = () => setNarrow(nq.matches);
    nq.addEventListener("change", onNarrow);
    return () => {
      mq.removeEventListener("change", on);
      nq.removeEventListener("change", onNarrow);
    };
  }, [loadCatalog]);

  // Keep the address bar in step with what is on screen, so any view can be shared as a link.
  useEffect(() => {
    if (!urlReady) return;
    const search = toUrlSearch({ filters, view: listOpen ? "list" : null, api: selectedId }, window.location.search);
    if (search !== window.location.search) window.history.replaceState(null, "", window.location.pathname + search + window.location.hash);
  }, [urlReady, filters, listOpen, selectedId]);

  // Shortcuts: "/" focuses search, "R" opens a random API. Ignored while typing or in a dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable='true']") || document.querySelector("dialog[open]")) return;
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
  // The single source of truth: map, list, counts and details all read `results`.
  const results = useMemo(() => filterEntries(entries, effective), [entries, effective]);
  const filtered = isFiltered(effective);
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
  const counts = useMemo(() => categoryCounts(entries, effective), [entries, effective]);
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
  const copyLink = async () => showToast((await copyText(window.location.href)) ? "Link copied. It opens this exact view." : "Copy failed. Copy the address bar instead.");

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

  /** Opens a random API from the current results (so it respects category and filters). */
  const surprise = () => {
    const pool = results.length > 1 ? results.filter((e) => e.id !== selectedId) : results;
    if (!pool.length) return;
    const pick = pool[Math.floor(Math.random() * pool.length)]!;
    if (!listOpen) mosaicRef.current?.focusEntry(pick.id);
    select(pick.id);
  };
  surpriseRef.current = surprise;
  const src = snapshot.source;

  return (
    <section className="app-shell" aria-label="Explore APIs" data-nav={narrow ? "drawer" : "sidebar"}>
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
          categoryIndex={categoryIndex}
          categoryGlyph={categoryGlyph}
          glyphs={glyphs}
          regions={regions}
          providerRegion={PROVIDER_REGION}
          selectedId={selectedId}
          onSelect={(id) => select(id)}
          onOpenSlot={() => router.push("/submit")}
          insetTop={hudH}
          insetRight={listOpen ? 440 : 0}
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
              onChange={(e) => set("q", e.target.value)}
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
            <button type="button" className="hud-btn hud-icon" aria-label="How to explore" aria-expanded={helpOpen} onClick={() => setHelpOpen((v) => !v)}>
              ?
            </button>
          </form>
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

        {filtersOpen && (
          <div className="float-panel filters-panel glass" id="filters-panel" role="group" aria-label="Filters" style={{ top: hudH - 4 }}>
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
                <strong>Shortcuts:</strong> <kbd>/</kbd> search, <kbd>R</kbd> surprise me, <kbd>Esc</kbd> close. <strong>Copy link</strong> in the bottom bar shares
                exactly what you see.
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
              />
            ) : null}
          </aside>
        )}

        {results.length === 0 && (
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
              Each tile is one of {stats.api.toLocaleString("en")} public APIs or {stats.mcp} MCP servers from the community catalog, plus a small, source-checked AI
              Models list curated by ApiWall. Scroll anywhere, search, and open a tile for its auth, HTTPS and CORS details and the official docs.
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

        {toast && (
          <div className="toast glass" role="status" data-testid="toast">
            {toast}
          </div>
        )}

        <footer className="status-bar glass">
          <span className="count" data-testid="result-count">
            <strong>{results.length.toLocaleString("en")}</strong> of {total.toLocaleString("en")} {results.length === 1 ? "listing" : "listings"}
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
