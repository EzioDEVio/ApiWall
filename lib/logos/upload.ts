import "server-only";
import { randomBytes } from "node:crypto";
import { MAX_LOGO_BYTES, sniffImage } from "@/lib/providers/validation";
import { loadSnapshot } from "@/lib/catalog/server";
import { saveLogo } from "@/lib/server/store";
import type { LogoFile } from "./types";

export const newLogoId = () => "l" + randomBytes(8).toString("hex");

/** Checks the uploaded image by its bytes (PNG, JPEG or WebP; no SVG) and size, then saves it privately. */
export async function readAndSaveLogo(form: FormData, id: string): Promise<{ ok: true; file: LogoFile } | { ok: false; error: string }> {
  const f = form.get("logoFile");
  if (!f || typeof f === "string" || f.size === 0) return { ok: false, error: "Choose a PNG, JPEG or WebP image" };
  if (f.size > MAX_LOGO_BYTES) return { ok: false, error: "Logos must be 256 KB or smaller" };
  const bytes = new Uint8Array(await f.arrayBuffer());
  const kind = sniffImage(bytes);
  if (!kind) return { ok: false, error: "Upload a PNG, JPEG or WebP image (SVG is not accepted)" };
  return { ok: true, file: { file: saveLogo(id, kind.ext, bytes), mime: kind.mime, bytes: bytes.length } };
}

/** Only real catalog listings can receive a logo. */
export function catalogListing(id: string) {
  return loadSnapshot().listings.find((l) => l.id === id) ?? null;
}

export function formStrings(form: FormData): Record<string, string> {
  const raw: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") raw[k] = v;
  return raw;
}
