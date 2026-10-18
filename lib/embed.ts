import { SITE_URL } from "./site";

/** The two lines another site pastes to show an ApiWall card (see public/embed.js). */
export function embedSnippet(kind: "api" | "category" | "pack", value: string, limit?: number): string {
  const attr = kind === "api" ? `data-apiwall-api="${value}"` : `data-apiwall-${kind}="${value}"${limit ? ` data-limit="${limit}"` : ""}`;
  return `<div ${attr}></div>\n<script src="${SITE_URL}/embed.js" async></script>`;
}
