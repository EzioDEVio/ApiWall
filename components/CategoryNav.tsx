"use client";

import { useEffect, useRef } from "react";
import { categoryColor } from "@/lib/explore/colors";
import { Glyph } from "./IdentityMark";

export interface CategoryRow {
  slug: string;
  name: string;
  glyph: string;
  /** Results this category would show with the other active filters. */
  count: number;
}

interface Props {
  rows: CategoryRow[];
  allCount: number;
  aiSlug: string;
  active: string; // "" = All APIs
  onChoose: (slug: string) => void;
  categoryIndex: Map<string, number>;
  glyphs: Record<string, string[]>;
  dark: boolean;
  /** Narrow windows: an overlay drawer with a close button instead of a fixed sidebar. */
  drawer: boolean;
  onClose: () => void;
  /** Jumps to the open provider tiles; null while filters hide them. */
  onOpenTiles: (() => void) | null;
}

const plural = (n: number) => `${n.toLocaleString("en")} ${n === 1 ? "result" : "results"}`;

/**
 * Vertical category list. "All APIs" and "AI Models" stay pinned at the top; the
 * rest scroll independently. Each row is a toggle button (aria-pressed) whose
 * accessible name includes its result count. Choosing one applies immediately.
 */
export function CategoryNav({ rows, allCount, aiSlug, active, onChoose, categoryIndex, glyphs, dark, drawer, onClose, onOpenTiles }: Props) {
  const panel = useRef<HTMLElement>(null);
  const ai = rows.find((r) => r.slug === aiSlug);
  const rest = rows.filter((r) => r.slug !== aiSlug);

  // A drawer takes focus when it opens.
  useEffect(() => {
    if (drawer) panel.current?.querySelector<HTMLButtonElement>("button[aria-pressed=true]")?.focus();
  }, [drawer]);

  // The active row stays in view when chosen from elsewhere (chips, reset, deep links).
  useEffect(() => {
    panel.current?.querySelector<HTMLElement>(".cat-list button[aria-pressed=true]")?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const row = (r: CategoryRow) => (
    <li key={r.slug}>
      <button
        type="button"
        className="cat-row"
        aria-pressed={active === r.slug}
        aria-label={`${r.name}, ${plural(r.count)}`}
        onClick={() => onChoose(r.slug)}
        data-slug={r.slug}
      >
        <i
          style={{
            background: categoryColor(categoryIndex.get(r.slug) ?? 0, dark),
          }}
          aria-hidden="true"
        />
        <Glyph paths={glyphs[r.glyph]} size={15} />
        <span className="cat-name">{r.name}</span>
        <span className={"cat-count" + (r.count === 0 ? " is-zero" : "")} aria-hidden="true">
          {r.count.toLocaleString("en")}
        </span>
      </button>
    </li>
  );

  return (
    <nav ref={panel} id="category-nav" className={"cat-nav" + (drawer ? " is-drawer glass" : "")} aria-label="Categories" data-testid="category-nav">
      <div className="cat-head">
        <h2>Categories</h2>
        {drawer && (
          <button type="button" className="cat-close" aria-label="Close categories" onClick={onClose}>
            ×
          </button>
        )}
      </div>
      <ul className="cat-pinned">
        <li>
          <button
            type="button"
            className="cat-row cat-all"
            aria-pressed={active === ""}
            aria-label={`All APIs, ${plural(allCount)}`}
            onClick={() => onChoose("")}
            data-slug=""
          >
            <i aria-hidden="true" />
            <Glyph paths={glyphs["layout-grid"] ?? ["M4 4h6v6h-6z", "M14 4h6v6h-6z", "M4 14h6v6h-6z", "M14 14h6v6h-6z"]} size={15} />
            <span className="cat-name">All APIs</span>
            <span className="cat-count" aria-hidden="true">
              {allCount.toLocaleString("en")}
            </span>
          </button>
        </li>
        {ai && row(ai)}
      </ul>
      <ul className="cat-list" aria-label="All categories">
        {rest.map(row)}
      </ul>
      {onOpenTiles && (
        <button type="button" className="cat-open" onClick={onOpenTiles}>
          <i aria-hidden="true" />
          Open tiles · Place your API
        </button>
      )}
    </nav>
  );
}
