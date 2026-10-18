import type { Entry } from "./model";
import { searchTerms } from "./model";

/**
 * Best matches for the search box, from the current results (so suggestions respect the
 * selected category and filters). Name matches outrank description matches; a name that
 * starts with the query ranks first; shorter names win ties.
 */
export function rankSuggestions(results: Entry[], q: string, limit = 8): Entry[] {
  const terms = searchTerms(q);
  if (!terms.length) return [];
  const phrase = terms.join(" ");
  const score = (e: Entry) => {
    const n = e.name.toLowerCase();
    if (n === phrase) return 0;
    if (n.startsWith(phrase)) return 1;
    if (n.split(/[\s\-_.]+/).some((w) => w.startsWith(terms[0]!))) return 2;
    if (terms.every((t) => n.includes(t))) return 3;
    return 4; // matched through the description or model names
  };
  return results
    .map((e) => ({ e, s: score(e) }))
    .sort((a, b) => a.s - b.s || a.e.name.length - b.e.name.length || a.e.name.localeCompare(b.e.name, "en"))
    .slice(0, limit)
    .map((x) => x.e);
}
