"use client";

import { useSyncExternalStore } from "react";

/** The browser's install offer (Chrome/Edge `beforeinstallprompt`), kept until it is used. */
interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let offer: InstallEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Called once from the layout, so an offer made on any page is kept for later. */
export function captureInstallOffer(): () => void {
  const onOffer = (e: Event) => {
    e.preventDefault(); // keep the offer for the "Install ApiWall" action instead of an instant mini-bar
    offer = e as InstallEvent;
    emit();
  };
  const onInstalled = () => {
    offer = null;
    emit();
  };
  window.addEventListener("beforeinstallprompt", onOffer);
  window.addEventListener("appinstalled", onInstalled);
  return () => {
    window.removeEventListener("beforeinstallprompt", onOffer);
    window.removeEventListener("appinstalled", onInstalled);
  };
}

/** True only while the browser is actually offering installation, so the action is never a dead control. */
export function useCanInstall(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => offer !== null,
    () => false,
  );
}

/** Shows the browser's own install dialog. Resolves to true if the visitor installed. */
export async function promptInstall(): Promise<boolean> {
  const o = offer;
  if (!o) return false;
  offer = null;
  emit();
  await o.prompt();
  return (await o.userChoice).outcome === "accepted";
}
