import type { Metadata } from "next";
import { SubmitForm } from "@/components/SubmitForm";
import { loadSnapshot } from "@/lib/catalog/server";
import { issueUrl, STATIC_MODE } from "@/lib/site";

export const metadata: Metadata = { title: "Place your API" };

export default function SubmitPage() {
  const categories = loadSnapshot()
    .categories.map((c) => c.name)
    .sort((a, b) => a.localeCompare(b));
  return (
    <div className="page narrow">
      <p className="eyebrow">Place your API</p>
      <h1>Feature your API on the mosaic</h1>
      {STATIC_MODE ? (
        <div className="prose" data-testid="submit-github">
          <p className="lede">
            This copy of the site is static, so submissions go through GitHub. Open the form, fill it in, and a maintainer checks every claim against the source you
            give before adding it. Submitting does not guarantee a listing.
          </p>
          <div className="key-warning big" role="note">
            <strong>Never submit a secret here.</strong> GitHub issues are public. Never paste API keys, tokens or passwords.
          </div>
          <p className="row">
            <a className="btn btn-primary" href={issueUrl("add-api.yml", "Add API: ")} target="_blank" rel="noopener noreferrer">
              Open the “Add an API” form on GitHub <span aria-hidden="true">↗</span>
            </a>
            <a className="btn" href={issueUrl("suggest-logo.yml", "Logo: ")} target="_blank" rel="noopener noreferrer">
              Suggest a logo <span aria-hidden="true">↗</span>
            </a>
          </p>
          <p className="muted small">You need a free GitHub account. Each form opens in a new tab.</p>
        </div>
      ) : (
        <>
          <p className="lede">
            Providers can submit a service for the directory, apply for a sponsored tile, or propose a provider-funded demo. A reviewer checks every claim against the
            source you give before anything is published. Submitting does not guarantee a listing.
          </p>
          <SubmitForm categories={categories} />
        </>
      )}
    </div>
  );
}
