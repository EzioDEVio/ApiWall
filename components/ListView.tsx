"use client";

import { useEffect, useState } from "react";
import type { Entry } from "@/lib/explore/model";
import { triLabel } from "@/lib/explore/explain";
import { ACCESS_LABELS } from "@/lib/providers/types";
import { Glyph, IdentityMark } from "./IdentityMark";

const PAGE = 48;

interface Props {
  entries: Entry[]; // already filtered
  categoryIndex: Map<string, number>;
  categoryGlyph: Map<string, string>;
  glyphs: Record<string, string[]>;
  onSelect: (id: string, opener: HTMLElement) => void;
  dark: boolean;
  savedIds?: Set<string>;
  newIds?: Set<string>;
  onToggleSave?: (id: string) => void;
}

const authLabel = (e: Entry) => (e.auth === "none" ? "No auth" : e.raw.auth || "Unknown auth");

export function ListView({ entries, categoryIndex, categoryGlyph, glyphs, onSelect, dark, savedIds, newIds, onToggleSave }: Props) {
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => setLimit(PAGE), [entries]);
  const shown = entries.slice(0, limit);

  return (
    <div className="list-view">
      <ul className="cards" data-testid="list-cards">
        {shown.map((e) => (
          <li key={e.id} data-id={e.id} className={"card" + (e.sponsored ? " card-sponsored" : "")}>
            <button type="button" className="card-hit" onClick={(ev) => onSelect(e.id, ev.currentTarget)} aria-label={`${e.name} — open details`}>
              <IdentityMark mark={e.mark} name={e.name} categoryIndex={categoryIndex.get(e.categorySlug) ?? 0} size={44} dark={dark} />
              <span className="card-main">
                <span className="card-title">{e.name}</span>
                <span className="card-cat">
                  <Glyph paths={glyphs[categoryGlyph.get(e.categorySlug) ?? ""]} size={13} />
                  {e.category}
                  {e.kind === "mcp" && <span className="tag">MCP</span>}
                  {e.source === "provider" && <span className="tag tag-provider">◆ Provider</span>}
                  {e.sponsored && <span className="tag tag-sponsor">★ Sponsored</span>}
                  {newIds?.has(e.id) && <span className="tag tag-new">New</span>}
                </span>
                <span className="card-desc">{e.description}</span>
                <span className="chips">
                  <span className="chip">{authLabel(e)}</span>
                  {e.kind === "mcp" ? (
                    <span className="chip">{e.raw.transport || "Transport unknown"}</span>
                  ) : (
                    <>
                      <span className="chip">HTTPS: {triLabel(e.https)}</span>
                      <span className="chip">CORS: {triLabel(e.cors)}</span>
                    </>
                  )}
                  {e.access !== "unknown" && <span className="chip chip-verified">✓ {ACCESS_LABELS[e.access]}</span>}
                </span>
              </span>
            </button>
            {onToggleSave && (
              <button
                type="button"
                className="card-save"
                aria-pressed={!!savedIds?.has(e.id)}
                aria-label={`Save ${e.name}`}
                title={savedIds?.has(e.id) ? "Saved (click to remove)" : "Save to your list"}
                onClick={() => onToggleSave(e.id)}
              >
                {savedIds?.has(e.id) ? "★" : "☆"}
              </button>
            )}
          </li>
        ))}
      </ul>
      {entries.length > limit && (
        <div className="more">
          <p className="muted small">
            Showing {shown.length.toLocaleString("en")} of {entries.length.toLocaleString("en")}
          </p>
          <button type="button" className="btn" onClick={() => setLimit((l) => l + PAGE * 2)}>
            Show more
          </button>
        </div>
      )}
    </div>
  );
}
