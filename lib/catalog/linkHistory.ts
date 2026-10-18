import type { LinkHealth } from "./links";

/**
 * Docs-link history across weekly checks, stored compactly: a new period starts only when the
 * set of unreachable links changes, so quiet weeks only move `lastCheckedAt` (which the sync
 * treats as a timestamp, so no pull request is opened for them).
 */
export interface LinkPeriod {
  /** First check that saw this exact set of unreachable links. */
  from: string;
  /** Latest check that still saw it. */
  lastCheckedAt: string;
  checked: number;
  /** Listing IDs whose docs link was unreachable, sorted. */
  unreachable: string[];
}

export interface LinkHistory {
  version: 1;
  /** Oldest first. */
  periods: LinkPeriod[];
}

export const EMPTY_LINK_HISTORY: LinkHistory = { version: 1, periods: [] };
const MAX_PERIODS = 104;

export function recordRun(history: LinkHistory, health: LinkHealth): LinkHistory {
  if (!health.checkedAt) return history;
  const ids = Object.keys(health.unreachable).sort();
  const periods = history.periods.map((p) => ({ ...p }));
  const last = periods[periods.length - 1];
  if (last && last.lastCheckedAt >= health.checkedAt) return history; // already recorded
  if (last && last.checked === health.checked && last.unreachable.length === ids.length && last.unreachable.every((x, i) => x === ids[i]))
    last.lastCheckedAt = health.checkedAt;
  else periods.push({ from: health.checkedAt, lastCheckedAt: health.checkedAt, checked: health.checked, unreachable: ids });
  return { version: 1, periods: periods.slice(-MAX_PERIODS) };
}

export interface LinkSpan {
  state: "reachable" | "unreachable";
  from: string;
  to: string;
}

/** One listing's history as runs of the same state, oldest first. */
export function linkSpans(history: LinkHistory, id: string): LinkSpan[] {
  const spans: LinkSpan[] = [];
  for (const p of history.periods) {
    const state = p.unreachable.includes(id) ? "unreachable" : "reachable";
    const last = spans[spans.length - 1];
    if (last && last.state === state) last.to = p.lastCheckedAt;
    else spans.push({ state, from: p.from, to: p.lastCheckedAt });
  }
  return spans;
}
