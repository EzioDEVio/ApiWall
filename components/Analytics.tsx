"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { GOATCOUNTER_CODE, trackEvent, trackPageview } from "@/lib/analytics";

/**
 * Counts page views on every route change, and clicks on links or buttons marked with
 * data-track="event-name" (so server-rendered pages can mark them without client code).
 * Renders nothing, and does nothing unless GoatCounter is configured (see lib/analytics.ts).
 */
export function Analytics() {
  const pathname = usePathname();
  useEffect(() => {
    if (GOATCOUNTER_CODE) trackPageview(pathname);
  }, [pathname]);
  useEffect(() => {
    if (!GOATCOUNTER_CODE) return;
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.("[data-track]");
      const name = el?.getAttribute("data-track");
      if (name) trackEvent(name);
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);
  return null;
}
