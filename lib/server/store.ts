import "server-only";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import type { AuditEntry, Submission } from "@/lib/providers/types";
import type { LogoSuggestion } from "@/lib/logos/types";
import { dataDir } from "./config";

// File-backed store for submissions and the audit trail. Writes are atomic
// (temp file + rename) and serialized within the process. This suits a single
// self-hosted server; serverless or multi-instance deployments need a database
// behind the same interface (see README → Production setup).

interface StoreData {
  version: 1;
  submissions: Submission[];
  audit: AuditEntry[];
  logos: LogoSuggestion[]; // logo suggestions for catalog listings (absent in older files)
}

let queue: Promise<unknown> = Promise.resolve();

function file() {
  return path.join(dataDir(), "submissions.json");
}
export function logoDir() {
  return path.join(dataDir(), "logos");
}

function read(): StoreData {
  const f = file();
  if (!existsSync(f)) return { version: 1, submissions: [], audit: [], logos: [] };
  const data = JSON.parse(readFileSync(f, "utf8")) as StoreData;
  data.logos ??= [];
  return data;
}

function write(data: StoreData) {
  mkdirSync(dataDir(), { recursive: true });
  const f = file();
  const tmp = `${f}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  renameSync(tmp, f);
}

/** Runs a read-modify-write transaction; transactions never interleave. */
export function transact<T>(fn: (data: StoreData) => T): Promise<T> {
  const run = queue.then(() => {
    const data = read();
    const result = fn(data);
    write(data);
    return result;
  });
  queue = run.catch(() => undefined);
  return run;
}

export function snapshot(): StoreData {
  return read();
}

export function saveLogo(id: string, ext: "png" | "jpg" | "webp", bytes: Uint8Array): string {
  mkdirSync(logoDir(), { recursive: true });
  const name = `${id}.${ext}`;
  writeFileSync(path.join(logoDir(), name), bytes, { mode: 0o600 });
  return name;
}

export function readLogo(name: string): Buffer | null {
  if (!/^[a-z0-9-]+\.(png|jpg|webp)$/.test(name)) return null;
  const p = path.join(logoDir(), name);
  return existsSync(p) ? readFileSync(p) : null;
}

export function deleteLogo(name: string) {
  if (!/^[a-z0-9-]+\.(png|jpg|webp)$/.test(name)) return;
  rmSync(path.join(logoDir(), name), { force: true });
}
