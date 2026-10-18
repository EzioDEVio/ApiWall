"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Entry } from "@/lib/explore/model";
import { paletteGroups, type PaletteAction, type PaletteItem } from "@/lib/explore/palette";
import { Glyph, IdentityMark } from "./IdentityMark";

interface Props {
  open: boolean;
  entries: Entry[];
  categories: { slug: string; name: string; count: number }[];
  actions: PaletteAction[];
  categoryIndex: Map<string, number>;
  dark: boolean;
  onClose: () => void;
  onPick: (item: PaletteItem) => void;
}

/** Ctrl+K / ⌘K: jump to any API, category or action by typing. */
export function CommandPalette({ open, entries, categories, actions, categoryIndex, dark, onClose, onPick }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const picked = useRef(false);
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      opener.current = document.activeElement as HTMLElement | null;
      picked.current = false;
      setQ("");
      setIdx(0);
      d.showModal();
      input.current?.focus();
    } else if (!open && d.open) d.close();
  }, [open]);

  const groups = useMemo(() => (open ? paletteGroups(q, entries, categories, actions) : []), [open, q, entries, categories, actions]);
  const flat = groups.flatMap((g) => g.items);
  const active = flat.length ? Math.min(idx, flat.length - 1) : -1;

  const pick = (item: PaletteItem) => {
    picked.current = true; // the picked action moves focus itself
    ref.current?.close();
    // Report the close now: the dialog's own "close" event arrives a moment later, and a quick
    // Ctrl+K in between must open a fresh palette rather than be undone by that late event.
    onClose();
    onPick(item);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!flat.length) return;
      setIdx((i) => (e.key === "ArrowDown" ? (Math.min(i, flat.length - 1) + 1) % flat.length : (Math.min(i, flat.length - 1) - 1 + flat.length) % flat.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0) pick(flat[active]!);
    }
  };

  // Keep the highlighted option in view.
  useEffect(() => {
    if (active >= 0) ref.current?.querySelector(`#pal-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  let n = -1;
  return (
    <dialog
      ref={ref}
      className="palette glass"
      aria-label="Command palette"
      data-testid="palette"
      onClose={() => {
        if (ref.current?.open) return; // a late event from an earlier close; the palette is open again
        const back = opener.current;
        opener.current = null;
        if (!picked.current && back && document.contains(back)) back.focus({ preventScroll: true });
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
    >
      <div className="palette-input">
        <Glyph paths={["M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0", "M21 21l-6 -6"]} size={18} />
        <input
          ref={input}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setIdx(0);
          }}
          onKeyDown={onKey}
          placeholder="Jump to an API, a category or an action…"
          role="combobox"
          aria-label="Search APIs, categories and actions"
          aria-expanded={flat.length > 0}
          aria-controls="palette-list"
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `pal-${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
        />
        <kbd>Esc</kbd>
      </div>
      <div id="palette-list" role="listbox" aria-label="Results" className="palette-list">
        {groups.map((g) => (
          <div key={g.name} role="group" aria-label={g.name} className="palette-group">
            <div className="palette-group-name" aria-hidden="true">
              {g.name}
            </div>
            {g.items.map((it) => {
              n += 1;
              const i = n;
              return (
                <div
                  key={it.key}
                  id={`pal-${i}`}
                  role="option"
                  aria-selected={i === active}
                  className="palette-item"
                  data-type={it.type}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(it)}
                  onMouseMove={() => i !== active && setIdx(i)}
                >
                  {it.type === "api" ? (
                    <IdentityMark mark={it.entry.mark} name={it.entry.name} categoryIndex={categoryIndex.get(it.entry.categorySlug) ?? 0} size={26} dark={dark} />
                  ) : (
                    <span className="palette-icon" aria-hidden="true">
                      {it.type === "category" ? "▦" : "›"}
                    </span>
                  )}
                  <span className="palette-label">{it.label}</span>
                  <span className="palette-sub">
                    {it.type === "api"
                      ? it.entry.category
                      : it.type === "category"
                        ? `${it.count.toLocaleString("en")} ${it.count === 1 ? "API" : "APIs"}`
                        : (it.action.hint ?? "")}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
        {q.trim() && !flat.length && (
          <p className="palette-empty" role="status">
            Nothing matches “{q.trim()}”.
          </p>
        )}
      </div>
      <p className="palette-foot" aria-hidden="true">
        <kbd>↑</kbd> <kbd>↓</kbd> to choose · <kbd>Enter</kbd> to open · <kbd>Ctrl</kbd> <kbd>K</kbd> anywhere
      </p>
    </dialog>
  );
}
