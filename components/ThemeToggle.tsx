"use client";

import { useEffect, useState } from "react";
import { applyTheme, readTheme, type ThemeChoice } from "@/lib/theme";

const NEXT: Record<ThemeChoice, ThemeChoice> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<ThemeChoice, string> = { system: "System", light: "Light", dark: "Dark" };
const ICON: Record<ThemeChoice, string[]> = {
  system: ["M3 5a1 1 0 0 1 1 -1h16a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1v-10z", "M7 20h10", "M9 16v4", "M15 16v4"],
  light: ["M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0", "M3 12h1m8 -9v1m8 8h1m-9 8v1m-6.4 -15.4l.7 .7m12.1 -.7l-.7 .7m0 11.4l.7 .7m-12.1 -.7l-.7 .7"],
  dark: ["M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z"],
};

/** Cycles System → Light → Dark. The choice is remembered in this browser. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeChoice>("system");
  useEffect(() => setTheme(readTheme()), []);
  const next = NEXT[theme];
  return (
    <button
      type="button"
      className="btn theme-btn"
      onClick={() => {
        applyTheme(next);
        setTheme(next);
      }}
      aria-label={`Theme: ${LABEL[theme]}. Switch to ${LABEL[next]}`}
      title={`Theme: ${LABEL[theme]} (click for ${LABEL[next]})`}
      data-testid="theme-toggle"
      data-theme-choice={theme}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {ICON[theme].map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    </button>
  );
}
