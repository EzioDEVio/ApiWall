"use client";

import { useEffect } from "react";
import { asset } from "@/lib/site";

/** Registers the offline service worker in production builds (never during `npm run dev`). */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const register = () => navigator.serviceWorker.register(asset("/sw.js"), { scope: asset("/") }).catch(() => undefined);
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);
  return null;
}
