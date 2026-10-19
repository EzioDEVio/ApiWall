import { BASE_PATH } from "./site";

/**
 * Cookie-free visit counts with GoatCounter (https://www.goatcounter.com).
 *
 * Off unless NEXT_PUBLIC_GOATCOUNTER is set to a GoatCounter site code at build time. When on,
 * each count is one image request to <code>.goatcounter.com/count with the page path (never
 * the search terms or other query text), the title, the referring site and the screen size.
 * No cookies, no local storage, no third-party script. Nothing is sent when the browser asks
 * not to be tracked (Do Not Track or Global Privacy Control), for automated browsers, or on
 * localhost.
 */
const RAW_CODE = (process.env.NEXT_PUBLIC_GOATCOUNTER ?? "").trim().toLowerCase();
export const GOATCOUNTER_CODE = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(RAW_CODE) ? RAW_CODE : "";
export const ANALYTICS_ORIGIN = GOATCOUNTER_CODE ? `https://${GOATCOUNTER_CODE}.goatcounter.com` : "";

interface Env {
  hostname: string;
  doNotTrack?: string | null;
  globalPrivacyControl?: boolean;
  webdriver?: boolean;
}

/** Whether counting is allowed in this browser. */
export function analyticsAllowed(env: Env, code = GOATCOUNTER_CODE): boolean {
  if (!code) return false;
  if (env.webdriver) return false;
  if (env.doNotTrack === "1" || env.doNotTrack === "yes" || env.globalPrivacyControl === true) return false;
  return !/^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|0\.0\.0\.0)$/.test(env.hostname);
}

/** The path as counted: no base path, no query string, no fragment. */
export function countPath(pathname: string): string {
  let p = pathname.split(/[?#]/)[0] || "/";
  if (BASE_PATH && (p === BASE_PATH || p.startsWith(BASE_PATH + "/"))) p = p.slice(BASE_PATH.length) || "/";
  return p;
}

/** Event names are short slugs like "open-api/openai-api". */
const EVENT_RE = /^[a-z0-9][a-z0-9/_-]{0,119}$/;

/** The /count URL for one page view or event. */
export function countUrl(hit: { path: string; title?: string; referrer?: string; screen?: string; event?: boolean }, code = GOATCOUNTER_CODE): string | null {
  if (!code) return null;
  if (hit.event && !EVENT_RE.test(hit.path)) return null;
  const q = new URLSearchParams({ p: hit.path });
  if (hit.title) q.set("t", hit.title.slice(0, 200));
  if (hit.referrer) q.set("r", hit.referrer);
  if (hit.screen) q.set("s", hit.screen);
  if (hit.event) q.set("e", "true");
  q.set("rnd", Math.random().toString(36).slice(2, 10)); // keeps caches from swallowing repeat counts
  return `https://${code}.goatcounter.com/count?${q.toString()}`;
}

/** Only another site's origin is kept as the referrer (never full URLs, never our own pages). */
export function externalReferrer(referrer: string, ownOrigin: string): string {
  try {
    const u = new URL(referrer);
    return u.origin === ownOrigin ? "" : u.origin;
  } catch {
    return "";
  }
}

function browserEnv(): Env {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return { hostname: location.hostname, doNotTrack: nav.doNotTrack, globalPrivacyControl: nav.globalPrivacyControl, webdriver: nav.webdriver };
}

function send(url: string | null) {
  if (!url) return;
  const img = new Image();
  img.referrerPolicy = "no-referrer"; // the path is already in the request; send nothing else
  img.src = url;
}

let firstView = true;

/** Counts a page view (called on every route change). */
export function trackPageview(pathname: string): void {
  if (typeof window === "undefined" || !analyticsAllowed(browserEnv())) return;
  const referrer = firstView ? externalReferrer(document.referrer, location.origin) : "";
  firstView = false;
  send(
    countUrl({
      path: countPath(pathname),
      title: document.title,
      referrer,
      screen: `${screen.width},${screen.height},${window.devicePixelRatio || 1}`,
    }),
  );
}

/** Counts an event, e.g. trackEvent("open-api/openai-api"). Never pass search terms or personal data. */
export function trackEvent(name: string): void {
  if (typeof window === "undefined" || !analyticsAllowed(browserEnv())) return;
  send(countUrl({ path: name, title: name, event: true }));
}
