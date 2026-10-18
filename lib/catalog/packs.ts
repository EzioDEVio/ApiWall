import { type Entry, inCategory } from "@/lib/explore/model";

/**
 * Starter packs: ready-made collections for common jobs. Every pack is a rule over facts the
 * catalog already has (auth, HTTPS, CORS, category, the weekly docs-link check), so packs stay
 * accurate as the catalog changes and never claim anything ApiWall hasn't recorded.
 */
export interface PackDef {
  slug: string;
  title: string;
  /** One sentence for cards and search results. */
  blurb: string;
  /** Why an API is in the pack, in plain words (shown on the pack page). */
  rule: string;
  emoji: string;
  includes: (e: Entry) => boolean;
  /** The same set on the wall, when filters can express it (otherwise a ?list= link is used). */
  wallQuery?: string;
}

const linkOk = (e: Entry) => e.link.state !== "unreachable";
const keyless = (e: Entry) => e.kind === "api" && e.auth === "none" && e.https === "yes" && linkOk(e);
const inAny = (e: Entry, slugs: string[]) => slugs.some((s) => inCategory(e, s));

export const PACKS: PackDef[] = [
  {
    slug: "no-key-needed",
    title: "No key needed",
    emoji: "🔓",
    blurb: "HTTP APIs that list no authentication and serve over HTTPS: call them in minutes.",
    rule: "No authentication listed, HTTPS supported, and the docs link was reachable at the last weekly check.",
    includes: keyless,
    wallQuery: "?type=api&auth=none&https=yes&links=ok",
  },
  {
    slug: "browser-ready",
    title: "Call it straight from the browser",
    emoji: "🌐",
    blurb: "No key, HTTPS and CORS enabled: fetch() them from a web page with no server in between.",
    rule: "No authentication listed, HTTPS supported, CORS enabled, and the docs link was reachable at the last check.",
    includes: (e) => keyless(e) && e.cors === "yes",
    wallQuery: "?type=api&auth=none&https=yes&cors=yes&links=ok",
  },
  {
    slug: "weather-app",
    title: "Build a weather app",
    emoji: "⛅",
    blurb: "Forecasts, conditions and air quality over HTTPS, ready for a weekend project.",
    rule: "In the Weather category, HTTPS supported, and the docs link was reachable at the last check.",
    includes: (e) => inCategory(e, "weather") && e.https === "yes" && linkOk(e),
    wallQuery: "?cat=weather&https=yes&links=ok",
  },
  {
    slug: "fun-first-projects",
    title: "Fun first projects",
    emoji: "🎲",
    blurb: "Animals, games, anime and entertainment APIs with no key: perfect for learning.",
    rule: "In Animals, Games & Comics, Anime, Entertainment or Personality; no authentication listed, HTTPS supported, docs link reachable.",
    includes: (e) => keyless(e) && inAny(e, ["animals", "games-and-comics", "anime", "entertainment", "personality"]),
  },
  {
    slug: "money-without-a-key",
    title: "Money data without a key",
    emoji: "💱",
    blurb: "Exchange rates, markets and crypto prices you can query without signing up.",
    rule: "In Finance, Currency Exchange or Cryptocurrency; no authentication listed, HTTPS supported, docs link reachable.",
    includes: (e) => keyless(e) && inAny(e, ["finance", "currency-exchange", "cryptocurrency"]),
  },
  {
    slug: "open-government-data",
    title: "Open and government data",
    emoji: "🏛️",
    blurb: "Public datasets from governments and open-data portals, no key required.",
    rule: "In Government or Open Data; no authentication listed and the docs link was reachable at the last check.",
    includes: (e) => e.kind === "api" && e.auth === "none" && linkOk(e) && inAny(e, ["government", "open-data"]),
  },
  {
    slug: "test-data",
    title: "Fake data for testing",
    emoji: "🧪",
    blurb: "Placeholder users, posts, images and more for prototypes and tests.",
    rule: "In the Test Data category and the docs link was reachable at the last check.",
    includes: (e) => inCategory(e, "test-data") && linkOk(e),
    wallQuery: "?cat=test-data&links=ok",
  },
  {
    slug: "ai-models",
    title: "AI model APIs",
    emoji: "✨",
    blurb: "Hosted model APIs, each checked by ApiWall against the provider's own docs.",
    rule: "In the curated AI Models category (provider facts checked against official docs, with dates).",
    includes: (e) => inCategory(e, "ai-models"),
    wallQuery: "?cat=ai-models",
  },
  {
    slug: "mcp-servers",
    title: "MCP servers for AI assistants",
    emoji: "🧩",
    blurb: "Model Context Protocol servers that give AI assistants new tools and data.",
    rule: "Listed in the MCP Servers table of the community catalog.",
    includes: (e) => e.kind === "mcp",
    wallQuery: "?type=mcp",
  },
];

export interface Pack extends Omit<PackDef, "includes"> {
  entries: Entry[];
  /** Wall link (relative, without base path). */
  wall: string;
}

const byName = (a: Entry, b: Entry) => a.name.localeCompare(b.name, "en") || a.id.localeCompare(b.id);

export function buildPacks(entries: Entry[]): Pack[] {
  return PACKS.map(({ includes, ...def }) => {
    const list = entries.filter((e) => e.source === "catalog" && includes(e)).sort(byName);
    const wall =
      def.wallQuery ??
      `?list=${list
        .slice(0, 100)
        .map((e) => e.id)
        .join(",")}`;
    return { ...def, entries: list, wall: `/${wall}` };
  });
}
