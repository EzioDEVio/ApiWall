import { EMPTY_FILTERS, type Filters } from "./model";
import { ACCESS_STATUSES } from "@/lib/providers/types";

/**
 * Shareable URLs: the active category, search, filters, view and open API live in the
 * query string, e.g. ?cat=ai-models&q=gpt&view=list&api=api-openai-api-x. Unknown or
 * invalid values are ignored rather than trusted.
 */
export interface UrlState {
  filters: Filters;
  view: "map" | "list" | null;
  api: string | null;
}

const ENUMS: Partial<Record<keyof Filters, readonly string[]>> = {
  kind: ["api", "mcp", "provider"],
  auth: ["none", "apiKey", "oauth", "other"],
  https: ["yes", "no", "unknown"],
  cors: ["yes", "no", "unknown"],
  access: ACCESS_STATUSES,
  logo: ["has", "missing"],
};
// Query parameter → filter key. Short, readable names.
const PARAMS: [string, keyof Filters][] = [
  ["q", "q"],
  ["cat", "category"],
  ["type", "kind"],
  ["auth", "auth"],
  ["https", "https"],
  ["cors", "cors"],
  ["access", "access"],
  ["logo", "logo"],
];

export function parseUrlState(search: string): UrlState {
  const p = new URLSearchParams(search);
  const filters: Filters = { ...EMPTY_FILTERS };
  for (const [param, key] of PARAMS) {
    const v = p.get(param);
    if (!v) continue;
    if (key === "q") filters.q = v.slice(0, 120);
    else if (key === "category") {
      if (/^[a-z0-9-]{1,80}$/.test(v)) filters.category = v;
    } else if (ENUMS[key]?.includes(v)) (filters as unknown as Record<string, string>)[key] = v;
  }
  const view = p.get("view");
  const api = p.get("api");
  return { filters, view: view === "list" || view === "map" ? view : null, api: api && /^[a-z0-9-]{1,120}$/.test(api) ? api : null };
}

/** The query string for a state; empty values are left out. Other parameters are kept. */
export function toUrlSearch(state: UrlState, existing = ""): string {
  const p = new URLSearchParams(existing);
  for (const [param, key] of PARAMS) {
    const v = key === "q" ? state.filters.q.trim() : state.filters[key];
    if (v) p.set(param, v);
    else p.delete(param);
  }
  if (state.view === "list") p.set("view", "list");
  else p.delete("view");
  if (state.api) p.set("api", state.api);
  else p.delete("api");
  const s = p.toString();
  return s ? `?${s}` : "";
}
