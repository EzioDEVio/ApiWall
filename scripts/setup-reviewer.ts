/*
 * Creates reviewer credentials for this machine:
 *   npm run reviewer:setup
 * Prints a new reviewer token once (keep it in a password manager) and writes only its
 * SHA-256 digest and a session secret to .env.local, which git ignores. Restart the
 * server afterwards. Run it again to replace the token; old sessions stop working.
 */
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const file = path.resolve(__dirname, "..", ".env.local");
const token = randomBytes(32).toString("base64url");
const digest = createHash("sha256").update(token).digest("hex");
const secret = randomBytes(32).toString("base64url");

const keep = existsSync(file)
  ? readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((l) => l.trim() && !/^(REVIEWER_TOKEN_SHA256|REVIEW_SESSION_SECRET)=/.test(l))
  : [];
writeFileSync(file, [...keep, `REVIEWER_TOKEN_SHA256=${digest}`, `REVIEW_SESSION_SECRET=${secret}`, ""].join("\n"), { mode: 0o600 });

console.log("✓ Reviewer access written to .env.local (token digest and session secret only).");
console.log("");
console.log("  Your reviewer token (shown once, not saved anywhere):");
console.log("  " + token);
console.log("");
console.log("Restart the server, open /review and paste the token to sign in.");
