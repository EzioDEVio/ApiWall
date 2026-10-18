import type { Entry } from "@/lib/explore/model";

/** Saved-list exports. Everything is built from the visitor's own list, in the browser. */
const pageUrl = (e: Entry, site: string) => (e.slug ? `${site}/apis/${e.slug}/` : `${site}/?api=${encodeURIComponent(e.id)}`);
const authText = (e: Entry) => (e.auth === "none" ? "No auth" : e.raw.auth || "Unknown");
const tri = (v: string) => (v === "yes" ? "Yes" : v === "no" ? "No" : "Unknown");
/** Only http(s) links, with characters that would end a Markdown link encoded. */
const mdUrl = (u: string | null) =>
  u && /^https?:\/\//i.test(u) ? u.replace(/[()\s<>]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`) : null;
const mdEscape = (s: string) =>
  s
    .replace(/[\\`*_[\]<>|]/g, (c) => `\\${c}`)
    .replace(/\s+/g, " ")
    .trim();

/** A Markdown table ready to paste into a README. */
export function toMarkdown(entries: Entry[], site: string): string {
  const lines = [
    `| API | Description | Auth | HTTPS | CORS | Docs |`,
    `| --- | --- | --- | --- | --- | --- |`,
    ...entries.map(
      (e) =>
        `| [${mdEscape(e.name)}](${pageUrl(e, site)}) | ${mdEscape(e.description)} | ${mdEscape(authText(e))} | ${e.kind === "mcp" ? "n/a" : tri(e.https)} | ${e.kind === "mcp" ? "n/a" : tri(e.cors)} | ${mdUrl(e.url) ? `[docs](${mdUrl(e.url)})` : ""} |`,
    ),
  ];
  return `${lines.join("\n")}\n\n_Saved from [ApiWall](${site}/). Data from the public-apis catalog (MIT)._\n`;
}

const csvCell = (v: string) => {
  // Neutralise spreadsheet formulas and quote everything.
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return `"${safe.replace(/"/g, '""')}"`;
};

export function toCsv(entries: Entry[], site: string): string {
  const head = ["name", "category", "description", "auth", "https", "cors", "docs_url", "apiwall_url"];
  const rows = entries.map((e) => [e.name, e.category, e.description, authText(e), e.https, e.cors, e.url ?? "", pageUrl(e, site)]);
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function toJson(entries: Entry[], site: string): string {
  return (
    JSON.stringify(
      {
        source: `${site}/`,
        exportedAt: new Date().toISOString(),
        apis: entries.map((e) => ({
          id: e.id,
          name: e.name,
          category: e.category,
          description: e.description,
          auth: authText(e),
          https: e.https,
          cors: e.cors,
          docsUrl: e.url,
          apiwallUrl: pageUrl(e, site),
        })),
      },
      null,
      2,
    ) + "\n"
  );
}

/** Starts a download of `text` as a file, without any server. */
export function downloadText(text: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
