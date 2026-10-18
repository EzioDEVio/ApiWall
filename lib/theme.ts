// Light / dark / follow-the-system, remembered per browser. The <head> script in
// app/layout.tsx applies the saved choice before the first paint, so there is no flash.
export type ThemeChoice = "system" | "light" | "dark";
export const THEME_KEY = "apiwall.theme";
export const THEME_EVENT = "apiwall-theme";

export function readTheme(): ThemeChoice {
  try {
    const t = window.localStorage.getItem(THEME_KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(t: ThemeChoice) {
  const root = document.documentElement;
  if (t === "system") delete root.dataset.theme;
  else root.dataset.theme = t;
  try {
    if (t === "system") window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, t);
  } catch {
    /* private mode: the choice lasts for this page only */
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}

/** Whether the page is dark right now (saved choice first, then the system setting). */
export function isDarkNow(): boolean {
  if (typeof window === "undefined") return false;
  const t = document.documentElement.dataset.theme;
  if (t === "dark") return true;
  if (t === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Calls `fn` whenever the effective theme may have changed. Returns an unsubscribe function. */
export function onThemeChange(fn: () => void): () => void {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", fn);
  window.addEventListener(THEME_EVENT, fn);
  return () => {
    mq.removeEventListener("change", fn);
    window.removeEventListener(THEME_EVENT, fn);
  };
}

export const THEME_BOOT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
