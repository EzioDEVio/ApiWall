import type { Entry } from "./model";
import { hasLogo } from "./model";
import { triLabel } from "./explain";
import { ACCESS_LABELS } from "@/lib/providers/types";

/** How many APIs fit side by side in a comparison. */
export const MAX_COMPARE = 3;

export interface CompareRow {
  key: string;
  label: string;
  values: string[];
  /** True when at least two of the compared APIs differ on this row. */
  differs: boolean;
}

/** Adds or removes `id`. Adding to a full comparison is refused, never silently dropping another API. */
export function toggleCompare(ids: string[], id: string): { ids: string[]; refused: boolean } {
  if (ids.includes(id)) return { ids: ids.filter((x) => x !== id), refused: false };
  if (ids.length >= MAX_COMPARE) return { ids, refused: true };
  return { ids: [...ids, id], refused: false };
}

const authText = (e: Entry) => (e.auth === "none" ? "No auth listed" : e.raw.auth || "Not listed");
const typeText = (e: Entry) => (e.source === "provider" ? "Provider-submitted" : e.kind === "mcp" ? "MCP server" : "HTTP API");
const notApplicable = "Does not apply (MCP)";

/**
 * The rows of a side-by-side comparison, in reading order. Every value comes from the same
 * facts the details panel shows; nothing is guessed. Rows that only some listings have
 * (AI model facts, MCP transport) appear only when at least one compared API has them.
 */
export function compareRows(entries: Entry[]): CompareRow[] {
  const rows: Omit<CompareRow, "differs">[] = [
    { key: "category", label: "Category", values: entries.map((e) => e.category) },
    { key: "type", label: "Type", values: entries.map(typeText) },
    { key: "auth", label: "Authentication", values: entries.map(authText) },
    { key: "https", label: "HTTPS", values: entries.map((e) => (e.kind === "mcp" ? notApplicable : triLabel(e.https))) },
    { key: "cors", label: "CORS", values: entries.map((e) => (e.kind === "mcp" ? notApplicable : triLabel(e.cors))) },
  ];
  if (entries.some((e) => e.kind === "mcp"))
    rows.push({ key: "transport", label: "Transport", values: entries.map((e) => (e.kind === "mcp" ? e.raw.transport || "Not listed" : "—")) });
  if (entries.some((e) => e.aiModel)) {
    rows.push({ key: "ai-provider", label: "Model provider", values: entries.map((e) => e.aiModel?.provider ?? "—") });
    rows.push({ key: "ai-models", label: "Models (as the docs name them)", values: entries.map((e) => e.aiModel?.models ?? "—") });
  }
  rows.push({
    key: "access",
    label: "Access and pricing",
    values: entries.map((e) => (e.claim ? `${ACCESS_LABELS[e.claim.status]} (verified)` : "Not verified")),
  });
  rows.push({
    key: "link",
    label: "Docs link (weekly check)",
    values: entries.map((e) =>
      e.link.state === "unreachable" ? `Not reachable: ${e.link.reason}` : e.link.state === "reachable" ? "Reachable" : "Not checked yet",
    ),
  });
  rows.push({ key: "logo", label: "Logo on the wall", values: entries.map((e) => (hasLogo(e) ? "Yes" : "Not yet")) });
  return rows.map((r) => ({ ...r, differs: new Set(r.values).size > 1 }));
}
