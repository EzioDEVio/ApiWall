import type { CommunityInfo, CorrectionInfo } from "@/lib/catalog/types";
import { REPO_URL } from "@/lib/site";

const FIELD: Record<string, string> = {
  url: "docs link",
  description: "description",
  category: "category",
  auth: "authentication",
  https: "HTTPS",
  cors: "CORS",
};

/** Says where a community listing or a correction came from, with a link to the approved request. */
export function RequestNote({ community, correction }: { community?: CommunityInfo; correction?: CorrectionInfo }) {
  if (!community && !correction) return null;
  return (
    <>
      {community && (
        <span data-testid="community-source">
          {community.providerSubmitted
            ? `Submitted by the provider${community.providerName ? ` (${community.providerName})` : ""}`
            : "Suggested by the community"}{" "}
          and added to ApiWall after review on {community.approvedAt} (
          <a href={`${REPO_URL}/issues/${community.issue}`} target="_blank" rel="noopener noreferrer">
            request #{community.issue}
          </a>
          ). Not part of the public-apis catalog.{" "}
        </span>
      )}
      {correction && (
        <span data-testid="correction-source">
          Corrected by ApiWall on {correction.approvedAt} ({correction.fields.map((f) => FIELD[f] ?? f).join(", ")};{" "}
          <a href={`${REPO_URL}/issues/${correction.issue}`} target="_blank" rel="noopener noreferrer">
            request #{correction.issue}
          </a>
          ).{" "}
        </span>
      )}
    </>
  );
}
