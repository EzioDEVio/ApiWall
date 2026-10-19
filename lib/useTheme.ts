"use client";

import { useSyncExternalStore } from "react";
import { isDarkNow, onThemeChange, readTheme, type ThemeChoice } from "./theme";

/** The saved choice (System, Light or Dark) as React state that follows every change. */
export function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(onThemeChange, readTheme, () => "system");
}
/** Whether the page is dark right now, as React state that follows every change. */
export function useIsDark(): boolean {
  return useSyncExternalStore(onThemeChange, isDarkNow, () => false);
}
