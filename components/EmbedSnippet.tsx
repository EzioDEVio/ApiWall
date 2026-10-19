"use client";

import { useState } from "react";
import { embedSnippet } from "@/lib/embed";
import { copyText } from "@/lib/clipboard";

/** The embed code for an API or a category, with a copy button. */
export function EmbedSnippet({ kind, value, limit }: { kind: "api" | "category" | "pack"; value: string; limit?: number }) {
  const code = embedSnippet(kind, value, limit);
  const [copied, setCopied] = useState<"" | "ok" | "fail">("");
  return (
    <div className="embed-snippet">
      {/* Scrollable on small screens, so it takes keyboard focus. */}
      <pre tabIndex={0} role="region" aria-label="Embed code">
        <code data-testid="embed-code">{code}</code>
      </pre>
      <button
        type="button"
        className="btn btn-small"
        data-track={`embed-copy/${kind}`}
        onClick={async () => {
          setCopied((await copyText(code)) ? "ok" : "fail");
          setTimeout(() => setCopied(""), 2000);
        }}
      >
        {copied === "ok" ? "Copied" : copied === "fail" ? "Copy failed" : "Copy embed code"}
      </button>
      <span className="sr-only" aria-live="polite">
        {copied === "ok" ? "Embed code copied" : ""}
      </span>
    </div>
  );
}
