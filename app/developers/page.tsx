import type { Metadata } from "next";
import Link from "next/link";
import { loadSnapshot } from "@/lib/catalog/server";
import { PUBLIC_API_VERSION } from "@/lib/catalog/publicApi";
import { issueUrl, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Developers: the ApiWall API",
  description: "Use ApiWall's catalog of public APIs in your own app: free, read-only JSON with no key, callable from browsers and servers.",
};

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en", { dateStyle: "long", timeZone: "UTC" });

export default function DevelopersPage() {
  const snap = loadSnapshot();
  const base = `${SITE_URL}/api/${PUBLIC_API_VERSION}`;
  const example = snap.listings.find((l) => l.name === "Claude API") ?? snap.listings[0]!;
  const exCat = snap.categories.find((c) => c.slug === "weather") ?? snap.categories[0]!;

  const js = `// Every API that needs no key and works from the browser
const res = await fetch("${base}/apis.json");
const { data } = await res.json();
const easy = data.filter((api) => api.auth.type === "none" && api.cors === true);
console.log(easy.length, "APIs you can call straight from a web page");`;
  const curl = `curl ${base}/categories/${exCat.slug}.json`;
  const py = `import requests

apis = requests.get("${base}/apis.json", timeout=30).json()["data"]
for api in apis:
    if "ai-models" in api["categories"]:
        print(api["name"], api["docsUrl"])`;

  return (
    <div className="page narrow prose" data-testid="developers">
      <p className="eyebrow">For developers</p>
      <h1>Use ApiWall in your app</h1>
      <p className="lede">
        Everything on the wall is available as plain JSON: every API with its category, auth, HTTPS, CORS, docs link and logo. It&apos;s free and read-only.
        There&apos;s no key or sign-up, and you can call it from a web page or a server.
      </p>

      <h2>Base URL</h2>
      <pre>
        <code>{base}/</code>
      </pre>
      <p>
        The data is refreshed by the weekly catalog sync. This copy was imported on <strong>{fmt(snap.source.importedAt)}</strong> and lists{" "}
        <strong>{snap.listings.length.toLocaleString("en")}</strong> entries. Each response says when its data was imported in{" "}
        <code>meta.source.importedAt</code>.
      </p>

      <h2>Endpoints</h2>
      <table>
        <thead>
          <tr>
            <th scope="col">Path</th>
            <th scope="col">What it returns</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <a href={`${base}/index.json`}>
                <code>index.json</code>
              </a>
            </td>
            <td>The list of endpoints, the source and the license notice.</td>
          </tr>
          <tr>
            <td>
              <a href={`${base}/apis.json`}>
                <code>apis.json</code>
              </a>
            </td>
            <td>Every API on the wall, sorted by name (about 1.2 MB). Filter it in your own code.</td>
          </tr>
          <tr>
            <td>
              <a href={`${base}/apis/${example.id}.json`}>
                <code>apis/&#123;id&#125;.json</code>
              </a>
            </td>
            <td>One API. IDs never change, so they&apos;re safe to store.</td>
          </tr>
          <tr>
            <td>
              <a href={`${base}/categories.json`}>
                <code>categories.json</code>
              </a>
            </td>
            <td>Every category with its slug, name and count.</td>
          </tr>
          <tr>
            <td>
              <a href={`${base}/categories/${exCat.slug}.json`}>
                <code>categories/&#123;slug&#125;.json</code>
              </a>
            </td>
            <td>The APIs in one category, including cross-listed ones (for example, AI Models).</td>
          </tr>
          <tr>
            <td>
              <a href={`${base}/changes.json`}>
                <code>changes.json</code>
              </a>
            </td>
            <td>
              What each sync added and removed, newest first (the same data as <Link href="/changes">What&apos;s new</Link>).
            </td>
          </tr>
        </tbody>
      </table>

      <h2>Examples</h2>
      <h3>JavaScript (browser or Node)</h3>
      <pre>
        <code>{js}</code>
      </pre>
      <h3>curl</h3>
      <pre>
        <code>{curl}</code>
      </pre>
      <h3>Python</h3>
      <pre>
        <code>{py}</code>
      </pre>

      <h2>Fields of an API</h2>
      <table>
        <tbody>
          <tr>
            <th scope="row">
              <code>id</code>, <code>name</code>, <code>description</code>
            </th>
            <td>As listed. The ID is permanent.</td>
          </tr>
          <tr>
            <th scope="row">
              <code>kind</code>
            </th>
            <td>
              <code>&quot;api&quot;</code> for HTTP APIs, <code>&quot;mcp&quot;</code> for MCP servers (which add an <code>mcp</code> object with transport and
              install links).
            </td>
          </tr>
          <tr>
            <th scope="row">
              <code>category</code>, <code>categories</code>
            </th>
            <td>Its own category, and every category slug it appears under on the wall.</td>
          </tr>
          <tr>
            <th scope="row">
              <code>auth</code>
            </th>
            <td>
              <code>listed</code> is the catalog&apos;s own words; <code>type</code> is one of <code>none</code>, <code>apiKey</code>, <code>oauth</code>,{" "}
              <code>x-mashape-key</code>, <code>user-agent</code>, <code>unknown</code> or <code>other</code>.
            </td>
          </tr>
          <tr>
            <th scope="row">
              <code>https</code>, <code>cors</code>
            </th>
            <td>
              <code>true</code>, <code>false</code>, or <code>null</code> when the catalog doesn&apos;t say. Always <code>null</code> for MCP servers.
            </td>
          </tr>
          <tr>
            <th scope="row">
              <code>docsUrl</code>, <code>wallUrl</code>
            </th>
            <td>The provider&apos;s docs, and the listing on ApiWall (opens its details).</td>
          </tr>
          <tr>
            <th scope="row">
              <code>logo</code>
            </th>
            <td>
              A small WebP hosted by ApiWall, with the provider page it came from, or <code>null</code>. Logos belong to their owners; show them only to
              identify the service.
            </td>
          </tr>
          <tr>
            <th scope="row">
              <code>addedAt</code>
            </th>
            <td>
              When the API first appeared on ApiWall, or <code>null</code> for the original import.
            </td>
          </tr>
          <tr>
            <th scope="row">
              <code>origin</code>, <code>aiModel</code>
            </th>
            <td>
              <code>&quot;public-apis&quot;</code> or <code>&quot;apiwall&quot;</code>. ApiWall&apos;s curated AI Models entries add an <code>aiModel</code>{" "}
              object with the provider, models, API host, docs and the date ApiWall checked them.
            </td>
          </tr>
        </tbody>
      </table>
      <p className="muted">
        Pricing and free tiers are not part of the API, because ApiWall only shows them when a reviewer has verified them. Check each provider&apos;s terms.
      </p>

      <h2>Good to know</h2>
      <ul>
        <li>
          <strong>Credit:</strong> the data comes from the{" "}
          <a href={`https://github.com/${snap.source.repo}`} target="_blank" rel="noopener noreferrer">
            public-apis
          </a>{" "}
          community catalog under the MIT license, plus ApiWall&apos;s curated AI Models list. If you republish it, keep that notice and a link back to ApiWall.
        </li>
        <li>
          <strong>Be kind to the host:</strong> the API is static files on GitHub Pages. Cache responses (they change about once a week) instead of fetching on
          every page view.
        </li>
        <li>
          <strong>Stability:</strong> fields in <code>v1</code> won&apos;t be renamed or removed. New fields may appear, so ignore ones you don&apos;t know.
          Breaking changes would come as <code>v2</code>.
        </li>
        <li>
          <strong>No guarantees:</strong> listings are community-sourced. ApiWall is independent and is not affiliated with public-apis or the listed providers.
        </li>
        <li>
          Found a wrong entry?{" "}
          <a href={issueUrl("report-listing.yml", "Report a listing")} target="_blank" rel="noopener noreferrer">
            Report it on GitHub
          </a>
          .
        </li>
      </ul>
    </div>
  );
}
