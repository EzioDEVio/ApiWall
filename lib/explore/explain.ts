import type { AuthKind, TriState } from "@/lib/catalog/types";

export function explainAuth(kind: AuthKind, raw: string): string {
  switch (kind) {
    case "none":
      return "The catalog lists no authentication. The provider may still apply limits, terms or registration.";
    case "apiKey":
      return "Needs an API key, usually issued after you create an account with the provider.";
    case "oauth":
      return "Uses OAuth: you register an app with the provider and request access tokens.";
    case "x-mashape-key":
      return "Needs an X-Mashape-Key header, which is a RapidAPI (formerly Mashape) key.";
    case "user-agent":
      return "No key, but requests must identify your app with a User-Agent header.";
    case "unknown":
      return "The catalog does not say how this API authenticates. Check the provider's documentation.";
    default:
      return `The catalog lists "${raw}". Check the provider's documentation for details.`;
  }
}

export function explainHttps(v: TriState, kind: "api" | "mcp"): string {
  if (kind === "mcp") return "MCP servers are listed by transport, not HTTPS support.";
  if (v === "yes") return "Served over HTTPS, so traffic to the API is encrypted.";
  if (v === "no") return "Listed without HTTPS support. Avoid sending anything sensitive.";
  return "HTTPS support is not listed.";
}

export function explainCors(v: TriState, kind: "api" | "mcp"): string {
  if (kind === "mcp") return "MCP servers run inside an AI client, so browser CORS does not apply.";
  if (v === "yes") return "Browser code on other websites can call it directly.";
  if (v === "no") return "Browsers block direct calls from other websites; call it from your server.";
  return "CORS support is unknown. Test it, or call it from your server.";
}

export const triLabel = (v: TriState) => (v === "yes" ? "Yes" : v === "no" ? "No" : "Unknown");
