// Deterministic parser for the public-apis README.
//
// Structure it relies on (verified against the upstream file):
//   - Everything before "## Index" is preamble: promotional banners, the
//     "## APILayer APIs" table and the "## MCP Servers" table.
//   - Only the "## MCP Servers" table is imported from the preamble, as a
//     separate listing kind. Promotional content is skipped.
//   - After "## Index", each "### <Category>" heading is followed by a table
//     with the columns API | Description | Auth | HTTPS | CORS.
//   - "## License" (or any later level-2 heading) ends the catalog.
// Anything that does not fit is recorded as a warning instead of throwing.

export interface RawApiRow {
  category: string;
  name: string;
  url: string;
  description: string;
  auth: string;
  https: string;
  cors: string;
  line: number;
}

export interface RawMcpRow {
  name: string;
  url: string;
  description: string;
  auth: string;
  transport: string;
  install: { label: string; url: string }[];
  line: number;
}

export interface ParseResult {
  categories: string[];
  apiRows: RawApiRow[];
  mcpRows: RawMcpRow[];
  warnings: string[];
  ignoredPromoRows: number;
}

/** Splits a markdown table row into cells, honoring escaped pipes and pipes inside link targets/code. */
export function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = "";
  let paren = 0;
  let code = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === "\\" && s[i + 1] === "|") {
      cur += "|";
      i++;
      continue;
    }
    if (ch === "`") code = !code;
    if (!code && ch === "(" && s[i - 1] === "]") paren = 1;
    else if (!code && paren > 0 && ch === "(") paren++;
    else if (!code && paren > 0 && ch === ")") paren--;
    if (ch === "|" && paren === 0 && !code) {
      cells.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

/** Parses the first markdown link in a cell, balancing parentheses in the URL. */
export function parseLink(cell: string): { text: string; url: string } | null {
  const open = cell.indexOf("[");
  if (open < 0) return null;
  let depth = 0;
  let close = -1;
  for (let i = open; i < cell.length; i++) {
    if (cell[i] === "[") depth++;
    else if (cell[i] === "]") {
      depth--;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  if (close < 0 || cell[close + 1] !== "(") return null;
  let p = 0;
  let end = -1;
  for (let i = close + 1; i < cell.length; i++) {
    if (cell[i] === "(") p++;
    else if (cell[i] === ")") {
      p--;
      if (p === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return null;
  const text = cell.slice(open + 1, close).trim();
  const url = cell.slice(close + 2, end).trim().split(/\s+/)[0] ?? "";
  if (!text) return null;
  return { text, url };
}

const isSeparator = (cells: string[]) => cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c.replace(/\s/g, "")));
const stripTicks = (s: string) => s.replace(/`/g, "").trim();
const cleanText = (s: string) =>
  s
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

export function parseReadme(markdown: string): ParseResult {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const result: ParseResult = { categories: [], apiRows: [], mcpRows: [], warnings: [], ignoredPromoRows: 0 };
  type Mode = "preamble" | "mcp" | "index" | "category" | "after";
  let mode: Mode = "preamble";
  let category = "";
  let header: string[] | null = null;

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim();
    const lineNo = idx + 1;

    const h2 = /^##\s+(.+?)\s*#*$/.exec(line);
    const h3 = /^###\s+(.+?)\s*#*$/.exec(line);
    if (h2 && !line.startsWith("###")) {
      const title = h2[1]!.trim();
      header = null;
      if (mode === "category" || mode === "index") {
        mode = /^index$/i.test(title) ? "index" : "after";
      } else if (/^mcp servers$/i.test(title)) mode = "mcp";
      else if (/^index$/i.test(title)) mode = "index";
      else if (mode === "mcp") mode = "preamble";
      return;
    }
    if (h3) {
      header = null;
      if (mode === "index" || mode === "category") {
        category = cleanText(h3[1]!);
        mode = "category";
        if (!result.categories.includes(category)) result.categories.push(category);
      }
      return;
    }
    if (/^#\s/.test(line)) {
      header = null;
      return;
    }
    if (!line.includes("|")) return;

    const cells = splitRow(line);
    if (isSeparator(cells)) return;

    // Header rows: capture column names so missing/reordered columns are handled.
    const lower = cells.map((c) => c.toLowerCase());
    if (!parseLink(cells[0] ?? "") && (lower.includes("description") || lower[0] === "api" || lower[0] === "name")) {
      header = lower;
      return;
    }

    if (mode === "preamble") {
      result.ignoredPromoRows++;
      return;
    }
    if (mode === "after" || mode === "index") return;

    const link = parseLink(cells[0] ?? "");
    if (!link) {
      result.warnings.push(`line ${lineNo}: row without a [name](url) link was skipped`);
      return;
    }
    const col = (name: string, fallback: number) => {
      const i = header ? header.indexOf(name) : -1;
      return cells[i >= 0 ? i : fallback] ?? "";
    };

    if (mode === "mcp") {
      const installCell = col("install", 4);
      const install: { label: string; url: string }[] = [];
      for (const part of installCell.split(/\s*[·•]\s*/)) {
        const l = parseLink(part);
        if (l) install.push({ label: cleanText(l.text), url: l.url });
      }
      result.mcpRows.push({
        name: cleanText(link.text),
        url: link.url,
        description: cleanText(col("description", 1)),
        auth: stripTicks(col("auth", 2)),
        transport: stripTicks(col("transport", 3)),
        install,
        line: lineNo,
      });
      return;
    }

    if (cells.length < 5) result.warnings.push(`line ${lineNo}: "${cleanText(link.text)}" has ${cells.length} columns; missing values imported as unknown`);
    result.apiRows.push({
      category,
      name: cleanText(link.text),
      url: link.url,
      description: cleanText(col("description", 1)),
      auth: stripTicks(col("auth", 2)),
      https: stripTicks(col("https", 3)),
      cors: stripTicks(col("cors", 4)),
      line: lineNo,
    });
  });

  return result;
}
