import type { Metadata } from "next";
import { cookies } from "next/headers";
import { reviewConfig } from "@/lib/server/config";
import { readSession, SESSION_COOKIE } from "@/lib/server/reviewAuth";
import { ReviewLogin } from "@/components/review/ReviewLogin";
import { ReviewDashboard } from "@/components/review/ReviewDashboard";

export const metadata: Metadata = { title: "Review", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  if (!reviewConfig()) {
    return (
      <div className="page narrow prose" data-testid="review-not-configured">
        <h1>Reviewer access is not set up</h1>
        <p>
          This server has no reviewer credentials, so the review area is closed. Submissions are still accepted and kept private. To enable review, set these
          environment variables on the server and restart it:
        </p>
        <ul>
          <li>
            <code>REVIEWER_TOKEN_SHA256</code>: the SHA-256 hex digest of a long random reviewer token.
          </li>
          <li>
            <code>REVIEW_SESSION_SECRET</code>: at least 32 random characters used to sign reviewer sessions.
          </li>
        </ul>
        <p>The README explains how to generate both. The token itself is never stored on the server.</p>
      </div>
    );
  }
  const session = readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return <ReviewLogin />;
  return <ReviewDashboard />;
}
