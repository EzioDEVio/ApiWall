"use client";

import { useMemo, useState } from "react";
import type { Entry } from "@/lib/explore/model";
import { codeSamples } from "@/lib/explore/snippets";
import { copyText } from "@/lib/clipboard";

/** Copy-ready starter code for an API. Shown only, never run: ApiWall makes no calls to listed APIs. */
export function CodeSamples({ entry }: { entry: Entry }) {
  const s = useMemo(() => codeSamples(entry), [entry]);
  const [tab, setTab] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);
  if (!s) return null;
  const current = s.samples[tab]!;
  const ids = (i: number) => ({ tab: `cs-tab-${entry.id}-${i}`, panel: `cs-panel-${entry.id}-${i}` });

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = (tab + (e.key === "ArrowRight" ? 1 : s.samples.length - 1)) % s.samples.length;
    setTab(next);
    document.getElementById(ids(next).tab)?.focus();
  };

  return (
    <section aria-labelledby="code-h" className="code-samples" data-testid="code-samples">
      <h3 id="code-h" className="section-h">
        Starter code
      </h3>
      <div className="code-tabs" role="tablist" aria-label="Language" onKeyDown={onKey}>
        {s.samples.map((x, i) => (
          <button
            key={x.id}
            id={ids(i).tab}
            type="button"
            role="tab"
            aria-selected={tab === i}
            aria-controls={ids(i).panel}
            tabIndex={tab === i ? 0 : -1}
            onClick={() => setTab(i)}
          >
            {x.label}
          </button>
        ))}
        <button
          type="button"
          className="btn btn-small code-copy"
          onClick={async () => {
            const ok = await copyText(current.code);
            setCopied(ok ? current.label : "error");
            setTimeout(() => setCopied(null), 1800);
          }}
        >
          {copied === current.label ? "Copied ✓" : "Copy"}
        </button>
      </div>
      <pre id={ids(tab).panel} role="tabpanel" aria-labelledby={ids(tab).tab} tabIndex={0} className="code-block" data-lang={current.id}>
        <code>{current.code}</code>
      </pre>
      <ul className="code-notes muted small">
        {s.notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
      <p className="sr-only" aria-live="polite">
        {copied === "error" ? "Copy failed. Select the code and copy it manually." : copied ? `${copied} code copied` : ""}
      </p>
    </section>
  );
}
