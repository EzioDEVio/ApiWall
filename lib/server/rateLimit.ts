// In-memory sliding-window limiter. Good for a single server process; a
// multi-instance deployment should back this with a shared store (see README).

export interface Limiter {
  check: (key: string, now?: number) => { ok: boolean; retryAfterSec: number };
  reset: () => void;
}

export function createLimiter(limit: number, windowMs: number): Limiter {
  const hits = new Map<string, number[]>();
  return {
    check(key, now = Date.now()) {
      const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (arr.length >= limit) {
        hits.set(key, arr);
        return { ok: false, retryAfterSec: Math.max(1, Math.ceil((windowMs - (now - arr[0]!)) / 1000)) };
      }
      arr.push(now);
      hits.set(key, arr);
      if (hits.size > 10_000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
      return { ok: true, retryAfterSec: 0 };
    },
    reset: () => hits.clear(),
  };
}

/** Client key for rate limiting. Forwarded headers are trusted only behind a configured proxy. */
export function clientKey(headers: Headers): string {
  if (process.env.TRUST_PROXY === "1") {
    const xff = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (xff) return "ip:" + xff;
    const real = headers.get("x-real-ip")?.trim();
    if (real) return "ip:" + real;
  }
  return "shared"; // without a trusted proxy every client shares one bucket
}

// Shared limiters for the process.
export const submissionLimiter = createLimiter(5, 10 * 60 * 1000); // per client
export const submissionGlobalLimiter = createLimiter(60, 60 * 60 * 1000); // whole site
export const loginLimiter = createLimiter(8, 15 * 60 * 1000);
export const logoLimiter = createLimiter(10, 10 * 60 * 1000); // logo suggestions per client
export const logoGlobalLimiter = createLimiter(120, 60 * 60 * 1000);
