import type { Metadata } from "next";
import Link from "next/link";
import { STATIC_MODE } from "@/lib/site";

export const metadata: Metadata = { title: "For Providers" };

export default function ProvidersPage() {
  return (
    <div className="page narrow prose">
      <p className="eyebrow">For Providers</p>
      <h1>Put your API on the map</h1>
      <p className="lede">
        ApiWall shows the public-apis community catalog as a mosaic. Providers can add reviewed information alongside it, clearly labelled as coming from the
        provider.
      </p>

      <div className="key-warning big" role="note">
        <strong>Never submit a secret here.</strong> We will contact verified providers about secure setup. The public form never asks for API keys, and refuses
        submissions that appear to contain one.
      </div>

      <h2>What you can request</h2>
      <dl className="options">
        <dt>Directory listing</dt>
        <dd>A tile in the provider area of the map and a card in the list. It shows your name, description, docs link and the technical facts you state.</dd>
        <dt>Sponsored tile</dt>
        <dd>
          The same tile, marked <span className="tag tag-sponsor">★ Sponsored</span> with a dashed frame wherever it appears. Sponsorship never changes catalog facts
          such as authentication, HTTPS or CORS, and never turns an access claim into a verified one. There is no checkout on this site.
        </dd>
        <dt>Provider-funded demo</dt>
        <dd>
          A proposal for a future in-site demo. Demos are currently disabled. One can only run after you authorise it, a reviewer approves it, and it has a verified
          quota, cost owner, limits, privacy notice and abuse contact, with credentials kept in a server-side secret store.
        </dd>
      </dl>

      <h2>How review works</h2>
      <ol>
        <li>
          {STATIC_MODE
            ? "You submit through a GitHub issue form. Issues are public, so include only what you are happy to publish."
            : "Your submission is stored privately as pending. It is not public."}
        </li>
        <li>A reviewer checks your domain, documentation and the source URL for each claim, and may edit wording for accuracy.</li>
        <li>
          Free-tier or pricing claims are shown only once verified, with the source, the date checked, limits, eligibility and expiry. Otherwise access shows as
          <em> Unknown</em>.
        </li>
        <li>Logos are reviewed before use and served from ApiWall, never hotlinked.</li>
        <li>
          Approved listings can be edited or removed later.{" "}
          {STATIC_MODE ? "Every decision is recorded in the issue thread and the repository history." : "Every review action is recorded in an audit log."}
        </li>
      </ol>

      <h2>Already in the catalog?</h2>
      <p>
        Catalog entries come from{" "}
        <a href="https://github.com/public-apis/public-apis" target="_blank" rel="noopener noreferrer">
          public-apis/public-apis
        </a>
        . To change those facts, contribute upstream. On ApiWall you can attach a reviewed access claim to your existing entry by giving its listing ID in the form;
        the imported facts stay exactly as the catalog has them.
      </p>

      <p>
        <Link href="/submit" className="btn btn-primary">
          Place your API
        </Link>
      </p>
    </div>
  );
}
