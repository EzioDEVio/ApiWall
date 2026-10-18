import { EMPTY_FILTERS, filterEntries, searchTerms, type Entry } from "./model";
import { rankSuggestions } from "./suggest";

/** Something the command palette can do that isn't opening an API or a category. */
export interface PaletteAction {
  id: string;
  label: string;
  /** Extra words that should find this action (e.g. "favourites" for Saved). */
  keywords?: string;
  hint?: string;
}

export type PaletteItem =
  | { type: "api"; key: string; label: string; entry: Entry }
  | { type: "category"; key: string; label: string; slug: string; count: number }
  | { type: "action"; key: string; label: string; action: PaletteAction };

export interface PaletteGroup {
  name: "APIs" | "Categories" | "Actions";
  items: PaletteItem[];
}

const LIMITS = { api: 6, category: 4, action: 6 };

/**
 * Results for the Ctrl+K palette. With no query it lists the actions. With a query it
 * finds APIs (ranked like the search suggestions, across the whole catalog), categories
 * whose names contain every word, and matching actions. An action whose name starts with
 * the query is listed first, so "saved" or "list" go straight to the action.
 */
export function paletteGroups(q: string, entries: Entry[], categories: { slug: string; name: string; count: number }[], actions: PaletteAction[]): PaletteGroup[] {
  const terms = searchTerms(q);
  const act = (a: PaletteAction): PaletteItem => ({ type: "action", key: `action:${a.id}`, label: a.label, action: a });
  if (!terms.length) return actions.length ? [{ name: "Actions", items: actions.slice(0, 10).map(act) }] : [];

  const has = (text: string) => {
    const t = text.toLowerCase();
    return terms.every((w) => t.includes(w));
  };
  const apis = rankSuggestions(filterEntries(entries, { ...EMPTY_FILTERS, q }), q, LIMITS.api).map(
    (e): PaletteItem => ({ type: "api", key: `api:${e.id}`, label: e.name, entry: e }),
  );
  const cats = categories
    .filter((c) => has(c.name) || has(c.slug.replace(/-/g, " ")))
    .slice(0, LIMITS.category)
    .map((c): PaletteItem => ({ type: "category", key: `cat:${c.slug}`, label: c.name, slug: c.slug, count: c.count }));
  const acts = actions.filter((a) => has(`${a.label} ${a.keywords ?? ""}`)).slice(0, LIMITS.action).map(act);

  const groups: PaletteGroup[] = [];
  const phrase = terms.join(" ");
  const actionFirst = acts.some((a) => a.label.toLowerCase().startsWith(phrase));
  if (actionFirst && acts.length) groups.push({ name: "Actions", items: acts });
  if (apis.length) groups.push({ name: "APIs", items: apis });
  if (cats.length) groups.push({ name: "Categories", items: cats });
  if (!actionFirst && acts.length) groups.push({ name: "Actions", items: acts });
  return groups;
}
