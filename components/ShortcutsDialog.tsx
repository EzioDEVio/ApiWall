"use client";

import { useEffect, useRef } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
}

type Keys = string[][]; // alternatives, each a key combination

const GROUPS: { title: string; rows: { keys: Keys; what: string }[] }[] = [
  {
    title: "Anywhere on the wall",
    rows: [
      {
        keys: [
          ["Ctrl", "K"],
          ["⌘", "K"],
        ],
        what: "Jump to any API, category or action",
      },
      { keys: [["/"]], what: "Search" },
      { keys: [["R"]], what: "Surprise me: open a random API" },
      { keys: [["?"]], what: "Show these shortcuts" },
      { keys: [["Esc"]], what: "Close the open panel or dialog" },
    ],
  },
  {
    title: "On the map (click it or Tab to it first)",
    rows: [
      { keys: [["←", "↑", "→", "↓"]], what: "Move between tiles" },
      { keys: [["Enter"], ["Space"]], what: "Open the focused tile" },
      { keys: [["+"], ["−"]], what: "Zoom in and out" },
      { keys: [["0"]], what: "Fit the whole map, or all results" },
      { keys: [["Ctrl", "scroll"]], what: "Zoom around the pointer" },
    ],
  },
  {
    title: "In an API's details",
    rows: [
      { keys: [["←"], ["→"]], what: "Previous or next API in the results" },
      { keys: [["Esc"]], what: "Close" },
    ],
  },
  {
    title: "In the Ctrl+K palette",
    rows: [
      { keys: [["↑"], ["↓"]], what: "Choose" },
      { keys: [["Enter"]], what: "Open" },
    ],
  },
];

/** The "?" sheet: every keyboard shortcut in one place. */
export function ShortcutsDialog({ open, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      opener.current = document.activeElement as HTMLElement | null;
      d.showModal();
    } else if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="shortcuts glass"
      aria-labelledby="shortcuts-title"
      data-testid="shortcuts"
      onClose={() => {
        if (ref.current?.open) return; // a late event from an earlier close
        const back = opener.current;
        opener.current = null;
        if (back && document.contains(back)) back.focus({ preventScroll: true });
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
    >
      {open && (
        <div className="shortcuts-body">
          <header className="shortcuts-head">
            <h2 id="shortcuts-title">Keyboard shortcuts</h2>
            <button type="button" className="detail-close" onClick={() => ref.current?.close()} aria-label="Close keyboard shortcuts" autoFocus>
              <span aria-hidden="true">×</span>
            </button>
          </header>
          <div className="shortcuts-grid">
            {GROUPS.map((g) => (
              <section key={g.title}>
                <h3>{g.title}</h3>
                <dl>
                  {g.rows.map((r) => (
                    <div key={r.what} className="shortcut-row">
                      <dt>
                        {r.keys.map((combo, i) => (
                          <span key={combo.join("+")}>
                            {i > 0 && <span className="muted"> or </span>}
                            {combo.map((k, j) => (
                              <span key={k}>
                                {j > 0 && combo.length === 2 && <span aria-hidden="true">+</span>}
                                <kbd>{k}</kbd>
                              </span>
                            ))}
                          </span>
                        ))}
                      </dt>
                      <dd>{r.what}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </div>
      )}
    </dialog>
  );
}
