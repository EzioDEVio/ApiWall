import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { loadSnapshot } from "@/lib/catalog/server";
import { buildPublicApi } from "@/lib/catalog/publicApi";
import { EMPTY_CHANGELOG, type Changelog } from "@/lib/catalog/history";
import { SITE_URL } from "@/lib/site";

// The same read-only JSON API the static site publishes as files under /api/v1/.
let files: Map<string, unknown> | null = null;
function api(): Map<string, unknown> {
  if (!files) {
    const p = path.join(process.cwd(), "data", "changelog.json");
    const log = existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as Changelog) : EMPTY_CHANGELOG;
    files = buildPublicApi(loadSnapshot(), log, SITE_URL);
  }
  return files;
}

const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, OPTIONS" };

export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const rel = (await ctx.params).path.join("/");
  const body = /^[a-z0-9./-]{1,200}$/.test(rel) && !rel.includes("..") ? api().get(rel) : undefined;
  if (body === undefined)
    return new Response(JSON.stringify({ error: "Not found. See /api/v1/index.json for the endpoints." }), {
      status: 404,
      headers: { "content-type": "application/json; charset=utf-8", ...CORS },
    });
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=300, stale-while-revalidate=86400", ...CORS },
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
