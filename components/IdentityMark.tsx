"use client";

import { useState } from "react";
import type { EntryMark } from "@/lib/explore/model";
import { brandInk, tileColor } from "@/lib/explore/colors";
import { asset } from "@/lib/site";

interface Props {
  mark: EntryMark;
  name: string;
  categoryIndex: number;
  size?: number;
  dark?: boolean;
}

/** SVG identity mark for list cards and the detail panel. Never blank: logos fall back to the monogram. */
export function IdentityMark({ mark, name, categoryIndex, size = 48, dark = false }: Props) {
  const [broken, setBroken] = useState(false);
  const r = Math.round(size * 0.18);

  if (mark.type === "logo" && !broken) {
    return (
      <span className="mark mark-logo" style={{ width: size, height: size, borderRadius: r }}>
        {/* Same-origin, reviewer-approved logo. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={asset(size <= 48 && mark.tile ? mark.tile : mark.src)}
          alt={`${name} logo`}
          width={size * 0.7}
          height={size * 0.7}
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
          data-testid="provider-logo"
        />
      </span>
    );
  }
  if (mark.type === "brand") {
    return (
      <span className="mark mark-brand" style={{ width: size, height: size, borderRadius: r }}>
        <svg viewBox="0 0 24 24" width={size * 0.56} height={size * 0.56} role="img" aria-label={`${mark.title} mark`}>
          <path d={mark.path} fill={brandInk(mark.hex)} />
        </svg>
      </span>
    );
  }
  const mono = mark.type === "logo" ? mark.fallback : mark;
  return (
    <span
      className="mark mark-mono"
      style={{ width: size, height: size, borderRadius: r, background: tileColor(categoryIndex, mono.seed, dark), fontSize: size * 0.38 }}
      role="img"
      aria-label={`${name} monogram`}
      data-testid={mark.type === "logo" ? "logo-fallback" : undefined}
    >
      <span className="mark-facet" data-corner={mono.seed % 4} aria-hidden="true" />
      <span aria-hidden="true">{mono.text}</span>
    </span>
  );
}

export function Glyph({ paths, size = 16, label }: { paths: string[] | undefined; size?: number; label?: string }) {
  if (!paths) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
      className="glyph"
    >
      {paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}
