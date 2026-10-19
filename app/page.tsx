import { isUpstream } from "@/lib/catalog/types";
import { Explore } from "@/components/Explore";
import { loadGlyphs, loadSnapshot } from "@/lib/catalog/server";

export default function ExplorePage() {
  const snap = loadSnapshot();
  // Counts from the upstream catalog only; curated AI Models entries are described separately.
  const upstream = snap.listings.filter(isUpstream);
  const api = upstream.filter((l) => l.kind === "api").length;
  const mcp = upstream.length - api;
  return (
    <>
      <h1 className="sr-only">ApiWall: a map of {api.toLocaleString("en")} public APIs and {mcp} MCP servers</h1>
      <Explore glyphs={loadGlyphs()} stats={{ api, mcp }} />
    </>
  );
}
