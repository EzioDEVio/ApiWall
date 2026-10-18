// Detects values that look like credentials so the public submission form can
// refuse them, and redacts them from anything that might be logged.

const PATTERNS: { kind: string; re: RegExp }[] = [
  { kind: "private key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { kind: "Anthropic key", re: /\bsk-ant-[A-Za-z0-9_-]{16,}/ },
  { kind: "OpenAI-style key", re: /\bsk-(?:proj-|live-|test-)?[A-Za-z0-9_-]{20,}/ },
  { kind: "Stripe key", re: /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}/ },
  { kind: "AWS access key", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { kind: "Google API key", re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { kind: "GitHub token", re: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/ },
  { kind: "Slack token", re: /\bxox[abposr]-[A-Za-z0-9-]{10,}/ },
  { kind: "bearer token", re: /\bbearer\s+[A-Za-z0-9._~+/=-]{20,}/i },
  { kind: "JWT", re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  // "api_key=…", "secret: …", "token …" followed by a long opaque value.
  { kind: "labelled secret", re: /\b(?:api[_-]?key|apikey|secret|client[_-]?secret|access[_-]?token|auth[_-]?token|password|passwd)\b\s*[:=]?\s*["']?[A-Za-z0-9._~+/=-]{16,}/i },
];

/** Long, mixed-character tokens with high entropy that are not URLs or emails. */
function looksLikeOpaqueToken(word: string): boolean {
  if (word.length < 32 || word.length > 512) return false;
  if (/^https?:\/\//i.test(word) || word.includes("@") || word.includes("/")) return false;
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/].filter((r) => r.test(word)).length;
  if (classes < 3) return false;
  const counts = new Map<string, number>();
  for (const ch of word) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let h = 0;
  for (const c of counts.values()) {
    const p = c / word.length;
    h -= p * Math.log2(p);
  }
  return h >= 4.2;
}

export interface SecretFinding {
  field: string;
  kind: string;
}

/**
 * Finds credential-shaped values. `entropy` adds a heuristic for long random
 * tokens; it is right for short form fields, too noisy for source code.
 */
export function findSecrets(fields: Record<string, string | null | undefined>, opts: { entropy?: boolean } = {}): SecretFinding[] {
  const entropy = opts.entropy ?? true;
  const out: SecretFinding[] = [];
  for (const [field, value] of Object.entries(fields)) {
    if (!value) continue;
    const hit = PATTERNS.find((p) => p.re.test(value));
    if (hit) {
      out.push({ field, kind: hit.kind });
      continue;
    }
    if (entropy && value.split(/[\s,;"'()<>]+/).some(looksLikeOpaqueToken)) out.push({ field, kind: "long random token" });
  }
  return out;
}

/** Replaces anything that looks like a credential with a fixed marker. */
export function redact(text: string): string {
  let t = text;
  for (const p of PATTERNS) t = t.replace(new RegExp(p.re.source, p.re.flags.includes("g") ? p.re.flags : p.re.flags + "g"), "[REDACTED]");
  return t
    .split(/(\s+)/)
    .map((w) => (looksLikeOpaqueToken(w) ? "[REDACTED]" : w))
    .join("");
}

/** Logging helper that never prints raw request content. */
export function safeLog(message: string, detail?: unknown) {
  const d = detail === undefined ? "" : " " + redact(typeof detail === "string" ? detail : JSON.stringify(detail));
  console.warn("[tessera] " + redact(message) + d);
}
