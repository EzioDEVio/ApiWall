/*
 * ApiWall service worker: keeps the site usable offline with the last catalog you opened.
 *
 *   Pages and catalog.json  network first, cached copy when offline (so new syncs show up at once)
 *   /_next/static/          cache first (file names change whenever the content does)
 *   marks, icons            stale-while-revalidate
 *
 * Only same-origin GET requests inside this site are handled; nothing else is touched or stored.
 * Bump VERSION to drop every old cache on the next visit.
 */
"use strict";
const VERSION = "v1";
const PAGES = "apiwall-pages-" + VERSION;
const STATIC = "apiwall-static-" + VERSION;
const MEDIA = "apiwall-media-" + VERSION;
const SCOPE = new URL(self.registration.scope).pathname; // "/" or "/ApiWall/"
const MAX_PAGES = 60;
const MAX_MEDIA = 600;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      .then((c) => c.addAll([SCOPE]))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("apiwall-") && ![PAGES, STATIC, MEDIA].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function trim(name, max) {
  const c = await caches.open(name);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

async function networkFirst(request, name, fallback) {
  const cache = await caches.open(name);
  try {
    const res = await fetch(request);
    if (res.ok && res.type === "basic") {
      await cache.put(request, res.clone());
      trim(name, MAX_PAGES);
    }
    return res;
  } catch (err) {
    const hit = (await cache.match(request, { ignoreSearch: request.mode === "navigate" })) || (fallback && (await cache.match(fallback)));
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(request, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok && res.type === "basic") await cache.put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(event, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(event.request);
  const fresh = fetch(event.request)
    .then(async (res) => {
      if (res.ok && res.type === "basic") {
        await cache.put(event.request, res.clone());
        trim(name, MAX_MEDIA);
      }
      return res;
    })
    .catch(() => undefined);
  if (hit) {
    event.waitUntil(fresh);
    return hit;
  }
  return (await fresh) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE)) return;
  const rest = url.pathname.slice(SCOPE.length);
  // Server-only routes (submissions, review) and the dev server's live reload are never cached.
  if (/^(api\/(?!catalog$|v1\/)|review|_next\/webpack-hmr)/.test(rest)) return;

  if (req.mode === "navigate") return event.respondWith(networkFirst(req, PAGES, SCOPE));
  if (rest === "catalog.json" || rest === "api/catalog" || rest.startsWith("api/v1/")) return event.respondWith(networkFirst(req, PAGES));
  if (rest.startsWith("_next/static/")) return event.respondWith(cacheFirst(req, STATIC));
  if (rest.startsWith("marks/") || rest.startsWith("icons/")) return event.respondWith(staleWhileRevalidate(event, MEDIA));
  // React Server Component payloads for client-side navigation.
  if (url.searchParams.has("_rsc") || rest.endsWith(".txt")) return event.respondWith(networkFirst(req, PAGES));
});
