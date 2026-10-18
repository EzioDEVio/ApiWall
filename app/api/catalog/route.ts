import { loadSnapshot } from "@/lib/catalog/server";
import { toBrowserCatalog } from "@/lib/catalog/browser";

export const dynamic = "force-static";

export function GET() {
  return new Response(JSON.stringify(toBrowserCatalog(loadSnapshot())), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=300, stale-while-revalidate=86400" },
  });
}
