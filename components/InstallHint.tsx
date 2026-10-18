"use client";

import { useEffect } from "react";
import { captureInstallOffer } from "@/lib/install";

/** Keeps the browser's "install this app" offer so the Ctrl+K palette can show it (renders nothing). */
export function InstallHint() {
  useEffect(() => captureInstallOffer(), []);
  return null;
}
