import type { LinkState } from "@/lib/catalog/links";

const day = (iso: string) => new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** The weekly docs-link check, in one line. Shows nothing before the first check. */
export function LinkStatus({ state }: { state: LinkState }) {
  if (state.state === "unchecked") return null;
  if (state.state === "reachable")
    return (
      <p className="link-status is-ok" data-testid="link-status" data-state="reachable">
        <span aria-hidden="true">✓</span> Docs link reachable when ApiWall checked it on {day(state.checkedAt)}.
      </p>
    );
  return (
    <p className="link-status is-down" role="note" data-testid="link-status" data-state="unreachable">
      <span aria-hidden="true">⚠</span>{" "}
      <span>
        <strong>Docs link not reachable:</strong> {state.reason}. Checked {day(state.checkedAt)}
        {state.since !== state.checkedAt ? `; failing since ${day(state.since)}` : ""}. The API may have moved or shut down, so look for its current docs before
        relying on it.
      </span>
    </p>
  );
}
