"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

// The visitor's saved APIs, kept in this browser only (no account, nothing sent anywhere).
const KEY = "apiwall.saved";
const EVENT = "apiwall-saved";
const MAX = 500;

function read(): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && /^[a-z0-9-]{1,120}$/.test(x)).slice(0, MAX) : [];
  } catch {
    return [];
  }
}

let cache: { raw: string | null; ids: string[] } = { raw: null, ids: [] };
function snapshot(): string[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    /* storage blocked: an in-memory list for this page */
    return memory;
  }
  if (raw !== cache.raw) cache = { raw, ids: read() };
  return cache.ids;
}
let memory: string[] = [];
const EMPTY: string[] = [];

function write(ids: string[]) {
  const next = [...new Set(ids)].slice(0, MAX);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    memory = next;
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => e.key === KEY && cb(); // other tabs
  window.addEventListener("storage", onStorage);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(EVENT, cb);
  };
}

export function useSaved() {
  const ids = useSyncExternalStore(subscribe, snapshot, () => EMPTY);
  const set = useMemo(() => new Set(ids), [ids]);
  const toggle = useCallback((id: string) => write(set.has(id) ? ids.filter((x) => x !== id) : [id, ...ids]), [ids, set]);
  const addMany = useCallback((more: string[]) => write([...ids, ...more.filter((x) => !set.has(x))]), [ids, set]);
  const clear = useCallback(() => write([]), []);
  return { ids, set, toggle, addMany, clear };
}
