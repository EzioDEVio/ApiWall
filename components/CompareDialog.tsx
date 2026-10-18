"use client";

import { useEffect, useRef, useState } from "react";
import type { Entry } from "@/lib/explore/model";
import { compareRows } from "@/lib/explore/compare";
import { IdentityMark } from "./IdentityMark";

interface Props {
  open: boolean;
  entries: Entry[];
  categoryIndex: Map<string, number>;
  dark: boolean;
  onClose: () => void;
  onRemove: (id: string) => void;
  onOpenDetails: (id: string) => void;
  onCopyLink: () => void;
}

function hostLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Two or three APIs side by side. Every cell is a fact the details panel also shows;
 * rows where the APIs differ are marked, and "Only differences" hides the rest.
 */
export function CompareDialog({ open, entries, categoryIndex, dark, onClose, onRemove, onOpenDetails, onCopyLink }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [onlyDiff, setOnlyDiff] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      opener.current = document.activeElement as HTMLElement | null;
      d.showModal();
    } else if (!open && d.open) d.close();
  }, [open]);

  const rows = compareRows(entries);
  const shown = onlyDiff ? rows.filter((r) => r.differs) : rows;
  const diffCount = rows.filter((r) => r.differs).length;

  return (
    <dialog
      ref={ref}
      className="detail compare"
      aria-labelledby="compare-title"
      data-testid="compare-dialog"
      onClose={() => {
        if (ref.current?.open) return; // a late event from an earlier close
        const back = opener.current;
        opener.current = null;
        if (back && document.contains(back)) back.focus({ preventScroll: true });
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close(); // backdrop
      }}
    >
      {open && (
        <div className="detail-body">
          <div className="detail-tools">
            <button type="button" className="detail-close" onClick={() => ref.current?.close()} aria-label="Close comparison">
              <span aria-hidden="true">×</span>
            </button>
          </div>
          <header className="compare-head">
            <p className="eyebrow">Side by side</p>
            <h2 id="compare-title">Compare {entries.length} APIs</h2>
            <div className="compare-tools">
              <label className="check">
                <input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} />
                Only differences ({diffCount})
              </label>
              <button type="button" className="btn btn-small" onClick={onCopyLink}>
                Copy link to this comparison
              </button>
            </div>
          </header>

          {entries.length < 2 ? (
            <p className="muted" data-testid="compare-need-more">
              Add {entries.length ? "one more API" : "two APIs"} to compare. Open any API and press <strong>⇄ Compare</strong>.
            </p>
          ) : (
            <div className="compare-scroll" tabIndex={0} role="region" aria-label="Comparison table">
              <table className="compare-table">
                <caption className="sr-only">
                  {entries.map((e) => e.name).join(", ")} compared. Rows marked “differs” have different values.
                </caption>
                <thead>
                  <tr>
                    <td />
                    {entries.map((e) => (
                      <th key={e.id} scope="col">
                        <div className="compare-api">
                          <IdentityMark mark={e.mark} name={e.name} categoryIndex={categoryIndex.get(e.categorySlug) ?? 0} size={40} dark={dark} />
                          <span className="compare-name">{e.name}</span>
                        </div>
                        <div className="compare-api-actions">
                          <button type="button" className="linkish" onClick={() => onOpenDetails(e.id)}>
                            Details
                          </button>
                          <button type="button" className="linkish" onClick={() => onRemove(e.id)} aria-label={`Remove ${e.name} from comparison`}>
                            Remove
                          </button>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.key} className={r.differs ? "is-diff" : undefined} data-row={r.key}>
                      <th scope="row">
                        {r.label}
                        {r.differs && <span className="diff-tag">differs</span>}
                      </th>
                      {r.values.map((v, i) => (
                        <td key={entries[i]!.id}>{v}</td>
                      ))}
                    </tr>
                  ))}
                  <tr data-row="description">
                    <th scope="row">Description</th>
                    {entries.map((e) => (
                      <td key={e.id} className="compare-desc">
                        {e.description || "No description in the catalog."}
                      </td>
                    ))}
                  </tr>
                  <tr data-row="docs">
                    <th scope="row">Docs</th>
                    {entries.map((e) => (
                      <td key={e.id}>
                        {e.url ? (
                          <a href={e.url} target="_blank" rel="noopener noreferrer nofollow">
                            {hostLabel(e.url)} <span aria-hidden="true">↗</span>
                            <span className="sr-only"> (opens an external site)</span>
                          </a>
                        ) : (
                          "No link listed"
                        )}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          <p className="muted small compare-note">
            Values come from the catalog or, for AI Models, from each provider&apos;s docs as checked. Pricing is shown only when a reviewer verified it.
          </p>
        </div>
      )}
    </dialog>
  );
}
