<div align="center">

<img src="docs/media/apiwall-hero.svg" alt="ApiWall: a wall of colourful API tiles lighting up in a wave" width="100%">

**Every public API on one zoomable wall.**
Search 2,150+ APIs, 20 MCP servers and a curated list of AI model APIs, filter by category or
auth, and open the docs in a click.

[**🌐 Open the live wall**](https://eziodevio.github.io/ApiWall/) ·
[Add an API](https://github.com/EzioDEVio/ApiWall/issues/new?template=add-api.yml) ·
[Suggest a logo](https://github.com/EzioDEVio/ApiWall/issues/new?template=suggest-logo.yml)

[![CI](https://github.com/EzioDEVio/ApiWall/actions/workflows/ci.yml/badge.svg)](https://github.com/EzioDEVio/ApiWall/actions/workflows/ci.yml)
[![Deploy](https://github.com/EzioDEVio/ApiWall/actions/workflows/pages.yml/badge.svg)](https://github.com/EzioDEVio/ApiWall/actions/workflows/pages.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-3d3bff.svg)](LICENSE)
[![APIs](https://img.shields.io/endpoint?url=https%3A%2F%2Feziodevio.github.io%2FApiWall%2Fapi%2Fv1%2Fbadges%2Fapis.json)](https://eziodevio.github.io/ApiWall/apis/)
[![Docs links](https://img.shields.io/endpoint?url=https%3A%2F%2Feziodevio.github.io%2FApiWall%2Fapi%2Fv1%2Fbadges%2Fdead-links.json)](https://eziodevio.github.io/ApiWall/stats/)
[![Starter packs](https://img.shields.io/endpoint?url=https%3A%2F%2Feziodevio.github.io%2FApiWall%2Fapi%2Fv1%2Fbadges%2Fpacks.json)](https://eziodevio.github.io/ApiWall/packs/)
[![Public API](https://img.shields.io/badge/public_API-v1-8f8fff.svg)](https://eziodevio.github.io/ApiWall/developers/)
![Next.js](https://img.shields.io/badge/Next.js-16-14161f.svg)

   <img src="docs/media/apiwall-demo.gif" alt="Flying over the ApiWall mosaic, colouring it by auth, picking AI Models, comparing three APIs side by side, jumping to Weather with Ctrl+K, opening an API's own page, and switching to dark mode" width="880">

</div>

## This week on ApiWall

<!-- Refreshed by the weekly catalog sync (npm run sync:report). Edit outside the markers. -->
<!-- this-week:start -->
**2,157 APIs** and **21 MCP servers** across **53 categories**.

**Latest catalog update (2026-10-19):** 12 new, 4 removed. [Africa Compliance Data](https://eziodevio.github.io/ApiWall/apis/africa-compliance-data/) · [CountdownsHQ](https://eziodevio.github.io/ApiWall/apis/countdownshq/) · [Nitrosend](https://eziodevio.github.io/ApiWall/apis/nitrosend/) · [FiberUp Fiber Database](https://eziodevio.github.io/ApiWall/apis/fiberup-fiber-database/) · [UK Public Tenders by Trade](https://eziodevio.github.io/ApiWall/apis/uk-public-tenders-by-trade/) · [Present of AI](https://eziodevio.github.io/ApiWall/apis/present-of-ai/) · [Refnusa](https://eziodevio.github.io/ApiWall/apis/refnusa/) · [StackRates](https://eziodevio.github.io/ApiWall/apis/stackrates/) and 4 more.

**Docs links:** 1,975 of 2,180 reachable (205 not reachable since 2026-10-19; 12 newly unreachable, 8 working again).

[What's new](https://eziodevio.github.io/ApiWall/changes/) · [Stats](https://eziodevio.github.io/ApiWall/stats/) · [Starter packs](https://eziodevio.github.io/ApiWall/packs/)
<!-- this-week:end -->

## Why it's fun to use

- **A wall you can fly over.** Every API is a tile on one large map. Scroll, drag or pinch to move;
  zoom from the whole wall down to logos and names.
- **Categories that really filter.** Pick a category, or **AI Models**, and only those tiles
  remain, packed together and fitted to your screen. Search and filters work the same way.
- **Color lenses.** Recolour the whole wall by auth, HTTPS, CORS or logo and see at a glance where
  the keyless or browser-friendly APIs are. Click a colour in the legend to show only those.
- **Instant suggestions.** Start typing and the best matches appear with their logos; arrow keys
  and Enter jump straight to one.
- **Details beside the map.** On wide screens an API opens in a side panel, and ‹ › (or the
  arrow keys) step through the results without losing your place.
- **Surprise me.** Press <kbd>R</kbd> (or the dice) to open a random API from what you're viewing.
- **Light or dark.** Follows your system, or pick one with the toggle in the header.
- **Starter code.** Each API shows copy-ready `curl`, JavaScript and Python with the right auth
  header. Keys stay in environment variables, and endpoints are never made up.
- **Save your favourites.** Star any API (on its card, or ☆ Save in its details) and find it
  under **Saved**. Saved APIs stay in your browser — no account, nothing sent anywhere — and
  **Copy share link** turns them into one link that opens as a shared list anyone can save.
- **Compare side by side.** Press **⇄ Compare** in any API's details to add it (up to three),
  then **Compare** shows auth, HTTPS, CORS, models, verified access and docs in one table, with
  the differences marked. The comparison has its own link, so you can share it.
- **Jump to anything.** Press <kbd>Ctrl</kbd>+<kbd>K</kbd> (<kbd>⌘</kbd>+<kbd>K</kbd> on a Mac) and
  type: open any API, pick a category, or run an action like "Show saved APIs" or "Use the dark theme".
- **A page for every API.** Each API has its own page (e.g. `/apis/openai-api/`) with auth,
  HTTPS, CORS, docs and related APIs, plus a page per category and an A–Z list, all listed in
  `sitemap.xml` so search engines can find them.
- **Docs links that are checked.** The weekly sync visits every docs link. Links that fail twice
  are marked "Docs link not reachable" with the date, and **Filters → Docs link → Hide broken
  links** removes them from view.
- **Embed cards.** Two lines of HTML show an ApiWall card for an API, or a short list for a
  category or starter pack, on any website. Every API page has its code ready to copy.
- **An API of its own.** Other apps can use the whole catalog as free, read-only JSON at
  `https://eziodevio.github.io/ApiWall/api/v1/` (no key, CORS open). See the **Developers** page.
- **Starter packs.** Ready-made sets for common jobs: [No key needed](https://eziodevio.github.io/ApiWall/packs/no-key-needed/),
  [Call it straight from the browser](https://eziodevio.github.io/ApiWall/packs/browser-ready/), [Build a weather app](https://eziodevio.github.io/ApiWall/packs/weather-app/)
  and more. Each pack is a plain rule over recorded facts (auth, HTTPS, CORS, the docs-link check),
  opens on the wall in one click, and comes as JSON and an embed card.
- **Catalog stats.** [Charts](https://eziodevio.github.io/ApiWall/stats/) of auth, HTTPS and CORS
  across the catalog, the biggest categories, broken docs links over time and APIs added per sync,
  each with a table view.
- **Hover to preview.** Point at a tile to see its description, auth, HTTPS and CORS before you
  open it. Palette jumps glide to the tile, and <kbd>?</kbd> lists every keyboard shortcut.
- **Export your saved list.** Download your saved APIs as a Markdown table for a README, a CSV for
  a spreadsheet or JSON for code.
- **Install it as an app.** ApiWall is a progressive web app: install it from the browser (or
  Ctrl+K → "Install ApiWall as an app") and it opens offline with the last catalog you loaded.
- **New this week.** APIs added by the weekly catalog sync carry a **NEW** badge for seven
  days, and the **What's new** page lists every sync's additions and removals.
- **Links that keep your view.** The address bar always holds the current category, search,
  filters and open API. Copy it, share it, and it opens exactly the same view.
- **Honest data.** Facts come straight from the [public-apis](https://github.com/public-apis/public-apis)
  catalog, every curated AI Models entry is checked against official docs with a date, and
  pricing is shown only when verified.
- **Works everywhere.** Keyboard and screen-reader friendly, no sideways scrolling, and on
  phones a bottom tab bar (Map, List, Categories, Saved) with details that slide up as a sheet
  you swipe down to close.

<table>
<tr>
<td><img src="docs/media/apiwall-ai-models.png" alt="AI Models category on the wall"></td>
<td><img src="docs/media/apiwall-details.png" alt="API details with starter code"></td>
</tr>
<tr>
<td><img src="docs/media/apiwall-compare.png" alt="Three AI model APIs compared side by side, differences marked"></td>
<td><img src="docs/media/apiwall-palette.png" alt="The Ctrl+K palette finding weather APIs and the Weather category"></td>
</tr>
<tr>
<td><img src="docs/media/apiwall-api-page.png" alt="An API's own page with facts, the docs link check and related APIs"></td>
<td><img src="docs/media/apiwall-lens.png" alt="The wall coloured by authentication"></td>
</tr>
</table>

<p align="center"><img src="docs/media/apiwall-divider.svg" alt="" width="100%"></p>

## Contribute in two minutes

No setup needed. Open a pre-filled form from any tile, or here:

| I want to… | Use |
| --- | --- |
| Add a public API (or my own) | [Add an API](https://github.com/EzioDEVio/ApiWall/issues/new?template=add-api.yml) |
| Give an API its real logo | [Suggest a logo](https://github.com/EzioDEVio/ApiWall/issues/new?template=suggest-logo.yml) |
| Fix a broken link or wrong detail | [Report a listing](https://github.com/EzioDEVio/ApiWall/issues/new?template=report-listing.yml) |

Code contributions are welcome too: see [CONTRIBUTING.md](CONTRIBUTING.md). If you like the
project, a ⭐ helps others find it.

<p align="center"><img src="docs/media/apiwall-divider.svg" alt="" width="100%"></p>

## Quick start

```bash
git clone https://github.com/EzioDEVio/ApiWall.git
cd ApiWall
npm install
npm run dev            # http://localhost:3000
```

The catalog snapshot is committed, so the site works offline. To refresh logos from each
provider's site, run `npm run catalog:logos` (about 3 minutes).

<p align="center"><img src="docs/media/apiwall-divider.svg" alt="" width="100%"></p>

## How it works

```mermaid
flowchart LR
  A[public-apis README] -->|npm run catalog:import| B[(data/catalog.snapshot.json)]
  C[data/ai-models.json<br/>curated, source-checked] --> B
  D[Provider logos<br/>npm run catalog:logos] --> B
  E[Maintainer-approved logos<br/>npm run logos:add] --> B
  B --> F[Static site<br/>GitHub Pages]
  B --> G[Self-hosted site<br/>+ submissions & review]
  F --> H[Canvas mosaic · list · details]
  G --> H
```

- **Stable map.** Each listing has a permanent tile, so refreshes never shuffle the wall.
- **One result set.** Search, category and filters run through one pipeline that drives the map,
  the list and every count.
- **Fast.** One canvas draws only the visible tiles, tiles load small WebP copies of each logo
  (about 6× lighter than the originals), and the browser gets a slimmed-down catalog.

## Two ways to run it

| | GitHub Pages (static) | Self-hosted (Node server) |
| --- | --- | --- |
| Explore, search, filters, details, starter code | ✅ | ✅ |
| Add an API / suggest a logo | GitHub issue forms | Built-in forms with review |
| Reviewer area (`/review`) | — | ✅ |
| Build | `npm run build:static` → `out/` | `npm run build && npm start` |

### Deploy to GitHub Pages

1. Push to `main`.
2. In the repository, open **Settings → Pages → Build and deployment** and set **Source** to **GitHub Actions**.
3. The **Deploy to GitHub Pages** workflow builds the static site and publishes it at
   `https://<owner>.github.io/<repo>/`.

To try the Pages build locally (Windows, macOS or Linux), stop `npm run dev` first, then run
`npm run preview:static` and open http://localhost:4173/ApiWall/.

### Site address

The address lives in one setting. By default the Pages workflow publishes at
`https://<owner>.github.io/<repo>/`. To move to your own domain later, add a repository variable
**SITE_URL** (Settings → Secrets and variables → Actions → Variables), for example
`https://apiwall.example`, and enter the same domain under **Settings → Pages → Custom domain**.
The workflow then builds with that address and no base path; links, the sitemap, share previews,
embed snippets and the weekly report all follow. Remove the variable to go back.

### Visit counts (cookie-free)

ApiWall can count visits with [GoatCounter](https://www.goatcounter.com/), which is free for
non-commercial sites and needs no cookies or consent banner. It is **off** until you turn it on:

1. Create a free account at goatcounter.com and pick a site code, e.g. `apiwall`
   (your dashboard is then `https://apiwall.goatcounter.com`).
2. In the repository add the variable **GOATCOUNTER_CODE** with that code.
3. Re-run **Deploy to GitHub Pages** (or push).

What is sent: one image request per page view with the path (never the query string, so search
text stays private), the page title, the referring site's origin and the screen size; plus named
events: `open-api/<slug>`, `category/<slug>`, `pack-wall/<slug>`, `pack-json/<slug>`, `docs/<slug>`,
`lens/<name>`, `compare`, `surprise`, `export/<format>`, `embed-copy/<kind>` and `install`.
Nothing is sent with Do Not Track or Global Privacy Control, from automated browsers, or on
localhost. The site's security policy allows the request only when the code is set, and the About
page tells visitors exactly this. The code is in `lib/analytics.ts` and `components/Analytics.tsx`.

### Weekly catalog sync

`.github/workflows/catalog-sync.yml` imports the latest catalog every Monday, fetches logos
for new listings and opens a pull request. Enable **Settings → Actions → General → Allow
GitHub Actions to create and approve pull requests** once (and press that section's **Save**).
In an organization, tick the same box under **Organization settings → Actions → General** first;
otherwise the repository setting has no effect. GitHub may ask you to **Approve and run
workflows** on the sync pull request before its checks run.
Weeks where only the "last checked" timestamps changed don't open a pull request
(`scripts/drop-timestamp-only-changes.mjs`).

### API pages, sitemap and search engines

The build generates `/apis/<slug>/` for every listing, `/categories/<slug>/` for every
category, `/apis/` (A–Z) and `/categories/`, plus `sitemap.xml` and `robots.txt`. Slugs are
assigned once by the importer (`lib/catalog/slugs.ts`) and never change, so links stay valid.
On a GitHub project page, search engines don't read `robots.txt` (it isn't at the domain root),
so submit `https://eziodevio.github.io/ApiWall/sitemap.xml` once in Google Search Console
(and Bing Webmaster Tools).

### Docs-link check

`npm run links:check` (run by the weekly sync) visits every docs link, one request at a time per
site, HEAD first and GET as a fallback, and retries failures after 30 seconds. Only links that
fail both times are written to `data/link-health.json`, with the date they first failed.
401/403/429 answers count as reachable, since they come from live servers that turn robots away.
If more than 30% fail at once, the runner's network is assumed to be the problem and nothing is
written.

### Embed widget

`public/embed.js` draws a card in a shadow root (so it never touches the host page's styles) from
the public API. It builds everything with text nodes, only links to http(s) URLs, and loads logos
from ApiWall's own host. See the Developers page for the snippet and options.

### Public API

`npm run build:static` also writes ApiWall's own read-only JSON API to `out/api/v1/`
(`index.json`, `apis.json`, `apis/{id}.json`, `categories.json`, `categories/{slug}.json`,
`changes.json`, `packs.json`, `packs/{slug}.json`, `stats.json` and `badges/*.json`), built by
`lib/catalog/publicApi.ts` from the committed snapshot. The badges use the
[shields.io endpoint](https://shields.io/badges/endpoint-badge) format, so a README can show live numbers:

```markdown
![APIs](https://img.shields.io/endpoint?url=https%3A%2F%2Feziodevio.github.io%2FApiWall%2Fapi%2Fv1%2Fbadges%2Fapis.json)
```
 The
self-hosted server answers the same paths at `/api/v1/...` with `Access-Control-Allow-Origin: *`.
The `/developers` page documents the fields. Fields in `v1` are only ever added, never renamed
or removed.

### Weekly report, health issue and releases

Each weekly sync also runs `npm run sync:report`, which rewrites the **This week on ApiWall**
section at the top of this README, writes the sync pull request's description, and keeps one open
**Docs-link health** issue (label `link-health`) listing every docs link that failed. The report
is built only from the committed data, so a quiet week changes nothing and opens no pull request.

To publish a release, push a version tag (`git tag v1.5.0 && git push origin v1.5.0`) or run the
**Release** workflow from the Actions tab. GitHub writes the notes from merged pull requests,
grouped by label (`.github/release.yml`).

### Install as an app (PWA)

`app/manifest.ts` and the icons in `public/icons/` make the site installable, and `public/sw.js`
keeps it working offline: pages and the catalog are network-first with a cached fallback, build
files are cache-first, and logos are refreshed in the background. It only stores this site's own
same-origin GET responses, never registers during `npm run dev`, and drops old caches when its
`VERSION` changes.

### Quality checks

Every push runs lint, strict types, unit tests, both builds, a secret scan and Playwright on
desktop and phone, including [axe](https://github.com/dequelabs/axe-core) accessibility scans of
every kind of page in light and dark themes (serious or critical problems fail the run). Pull
requests also get a [Lighthouse](https://github.com/GoogleChrome/lighthouse-ci) run on the static
site: accessibility below 95 or SEO below 90 fails the check, and the reports are attached to the run.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` / `npm run build` / `npm start` | Develop, build, serve |
| `npm run build:static` | Static export for GitHub Pages (`out/`); add `-- --base /ApiWall` for a project page |
| `npm run preview:static` | Build like GitHub Pages and serve it at http://localhost:4173/ApiWall/ |
| `npm run lint` · `npm run typecheck` | ESLint · `tsc --noEmit` (strict) |
| `npm test` · `npm run test:e2e` | Vitest unit/component tests · Playwright on desktop and mobile (`npx playwright install chromium` once, `npm run build` first) |
| `npm run catalog:import` | Refresh the catalog snapshot from upstream |
| `npm run catalog:logos` | Download each API's own logo into `public/marks/`, make small tile copies, then rebuild the snapshot |
| `npm run links:check` | Check every docs link and update `data/link-health.json` and `data/link-history.json` (needs internet; run weekly by the sync) |
| `npm run sync:report` | Refresh the README's "This week on ApiWall" section (add `-- --out <dir>` for the pull request text and health issue) |
| `npm run logos:optimize` | Make the small WebP copies tiles use (`public/marks/tiles/`); originals stay untouched |
| `npm run logos:add -- "<name or id>" <image> <https source>` | Commit a maintainer-approved logo (also `logos:remove`, `logos:promote`) |
| `npm run reviewer:setup` | Create reviewer credentials in `.env.local` (self-hosted only) |
| `npm run media:demo` | Record `docs/media/apiwall-demo.gif` from a running site |
| `npm run check:secrets` | Scan source and the built bundle for credentials (run after `build`) |

## Refreshing the catalog

```bash
npm run catalog:import                   # fetch master from GitHub; falls back to the cached README
npm run catalog:import -- --offline      # rebuild from data/upstream/README.md only
npm run catalog:import -- --ref <sha>    # pin an upstream commit
npm run catalog:import -- --readme f.md  # import a local file
```

The importer parses each category table and the separate MCP Servers table, skips
promotional sections, de-duplicates rows, and keeps raw Auth/HTTPS/CORS values verbatim.
Listing IDs come from name + URL, and **placements are carried over from the previous
snapshot**, so existing tiles never move; new listings take free slots in their category
band. If GitHub is unreachable it rebuilds from `data/upstream/README.md`; with no cache
it fails instead of inventing data. Commit the updated `data/` files after a refresh.

Each import also dates listings it has not seen before (`addedAt` in the snapshot) and adds
an entry to `data/changelog.json` with what was added and removed. That file feeds the
**What's new** page and the NEW badges. Listings from the very first import have no date,
because there is no way to know when they joined public-apis.

The JSON service mentioned in the upstream README (`api.publicapis.org`, from
davemachado/public-api) did not respond when checked and is not used.

## Categories, search and the map

One filter pipeline (`lib/explore/model.ts`) produces the visible result set. The map, the
list, the result count, the per-category counts and the details panel all read that same
set. Every active criterion applies together (AND), and categories match by exact slug
(or a curated tag), never by substring.

- **Category list.** A vertical sidebar on wide windows; below 900 px it becomes a drawer
  opened from the **Categories** button. **All APIs** and **AI Models** stay pinned at the
  top. Each row shows how many results choosing it would give with the other filters.
- **Map.** With nothing filtered, the full map keeps every tile at its stable position.
  With a category, search or filter active, only the matching tiles are drawn, packed into a
  compact grid and fitted to the view. Listing IDs never change. Clearing all filters brings
  the full map back where you left it. Zero matches show an empty state with the query.
- **Active filters** appear as removable chips under the search bar, with **Reset filters**.

## AI Models (curated supplement)

The upstream catalog has no AI Models category, so ApiWall adds one from
`data/ai-models.json`, a small curated list that is kept separate from the upstream data:

- `providers`: model APIs that are not in public-apis (OpenAI, Anthropic, DeepSeek, xAI,
  Perplexity, Cerebras). They are labelled as added by ApiWall, not as catalog entries.
- `crossTags`: public-apis listings that serve generative models (Google Gemini, Mistral AI,
  Cohere, Groq, OpenRouter, Together AI, Replicate). They keep their upstream category
  (Machine Learning) and are also shown under AI Models.
- Each entry records the official docs URL, the models the docs name, the auth method and
  the date it was checked. Free tiers and pricing are **not** verified and show as Unknown.
  `notVerified` lists providers left out because their docs could not be confirmed.

Generic machine-learning tools stay in Machine Learning only. Entries without an https docs
link or a check date are rejected at import. To change the list, edit the file, check each
entry against the provider's docs, then run `npm run catalog:import -- --offline`.

## Logos

The upstream catalog has no logos. To fill tiles with each API's real logo, run this
on a machine with normal internet access (it reads about 2,000 sites and takes a few
minutes):

```bash
npm run catalog:logos                 # fetch missing logos, then rebuild the snapshot
npm run catalog:logos -- --limit 50   # try a small batch first
npm run catalog:logos -- --retry      # retry listings that failed last time
npm run catalog:logos -- --refresh    # re-fetch everything
```

For each listing it reads the provider's own home page and saves the icon that page
declares (largest first), else the site's `/favicon.ico`, else, for GitHub-hosted
projects, the owner's avatar. SVG is never used. Files are checked by their bytes
(PNG, JPEG, WebP, GIF or ICO, 16 px to 4096 px, at most 300 KB) and saved to
`public/marks/`, with the source page and date recorded in `data/favicons.json`. Pages
that belong to a platform rather than the provider (GitHub, RapidAPI, Postman,
Google Docs and similar) are never read, and an icon shared by three or more unrelated
domains is treated as a platform default and dropped. The site serves these files
itself and never loads images from other websites. Each tile's detail panel names
where its logo came from. Commit `public/marks/` and `data/` afterwards.

Without this step, tiles show a Simple Icons brand mark where a defensible one exists
and a generated monogram otherwise.

## Adding missing logos

`npm run catalog:logos` finds a logo for most listings, but some sites publish none it can
use. Logos that should ship with the site are **committed to the repo**: files in
`public/marks/community/`, records in `data/community-logos.json`. They work on GitHub
Pages and the self-hosted site alike, and are labelled "Approved by an ApiWall maintainer"
with their source page.

- **From a GitHub issue** (the static site's "Suggest a logo" button opens one): download the
  image, check it is the provider's own, then run
  `npm run logos:add -- "<listing name or id>" path/to/logo.png https://provider.example/brand`
  and commit.
- **From the self-hosted review area**: visitors can upload suggestions from any listing,
  and reviewers approve them in `/review` → **Logos**, or publish one directly with **Add a
  logo to a listing**. These live in `data/runtime/` on that server; run
  `npm run logos:promote` to copy every approved logo into the repo, then commit.
- `npm run logos:remove -- "<listing name or id>"` takes one out again.

Images must be PNG, JPEG or WebP (checked by their bytes; SVG is refused), up to 256 KB.
In Explore, **Filters → Logo → No logo yet** lists the listings still missing one.

## Reviewer access

The review area (`/review`) and its API are closed unless both variables are set. There
is no built-in password. The quickest setup on your own machine:

```bash
npm run reviewer:setup   # prints a token once; writes only its digest + a session secret to .env.local
```

Restart the server, open `/review` and paste the token. To set the variables yourself instead:

```bash
node -e "const c=require('crypto');const t=c.randomBytes(32).toString('base64url');console.log('token  (give to reviewer):',t);console.log('REVIEWER_TOKEN_SHA256=',c.createHash('sha256').update(t).digest('hex'));console.log('REVIEW_SESSION_SECRET=',c.randomBytes(32).toString('base64url'))"
```

Put the two variables in the server environment (see `.env.example`). Only the token's
SHA-256 is stored; sessions are HMAC-signed, HttpOnly, SameSite=Strict cookies that last
eight hours, and every mutation also requires a same-origin request. Reviewers can
inspect, edit, approve, reject and remove submissions, verify access claims with a source
and date, and see an audit trail.

## Provider submissions

`/submit` collects only what review needs and never asks for keys. Inputs are validated
and stripped to plain text; the contact email must be on the provider's domain;
anything that looks like a credential is refused before anything is stored; a honeypot,
a minimum fill time and rate limits block spam. Uploaded logos must be PNG, JPEG or WebP
(checked by magic bytes, ≤ 256 KB) and are served only after a reviewer approves them.
Submissions stay private until approved. Approved listings appear in the provider band at
the bottom of the map, labelled ◆ Provider-submitted, and ★ Sponsored with a dashed frame
when sponsorship was requested and approved. Sponsorship never changes catalog facts, and
claims on existing catalog entries attach beside the imported values without altering them.

Access claims default to **Unknown**. A claim is shown only after a reviewer records the
provider's source URL, the date checked, limits, eligibility, expiration and terms.

## In-site demos

Disabled. There is no secret manager in this project, so no provider credential can be
stored safely. `/api/demos/*` always returns 404 and forwards nothing, and no "Try demo"
control is rendered. `docs/DEMOS.md` lists what an approved demo would require.

## Self-hosted setup

- **Storage.** Submissions, the audit log and uploaded logos are written to
  `data/runtime/` (or `TESSERA_DATA_DIR`) with atomic file writes. That suits one
  long-running Node server with a persistent disk. Serverless or multi-instance hosting
  needs a database and object storage behind `lib/server/store.ts`.
- **Rate limits** are in memory per process. Behind a reverse proxy, set `TRUST_PROXY=1`
  so limits apply per client IP; without it all clients share one bucket. Multi-instance
  deployments need a shared limiter.
- Security headers, including a CSP that blocks third-party images and scripts, are set
  in `next.config.ts`.

## Tile marks

The catalog has no logos. A brand mark from [Simple Icons](https://simpleicons.org)
(CC0-1.0 icon data; marks remain trademarks of their owners) is shown only when that
project recorded the mark from the listing's own domain or GitHub organisation, the host
is not a shared platform, and the listing name identifies the mark. Every other tile gets
a generated monogram. Category icons are [Tabler Icons](https://tabler.io/icons) (MIT).

## Project map

```
app/                 pages (Explore, API, category, packs, stats, Submit, For Providers, What's new, Developers, About & Source, Review), /api/v1 route, web app manifest, social preview image
components/          Mosaic (canvas), CategoryNav, ListView, DetailDialog, CompareDialog, CommandPalette, ShortcutsDialog, Charts, CodeSamples, LogoSuggest, review UI
lib/catalog/         README parser, normalizer, placement, marks, AI Models supplement, community logos, snapshot builder, changelog, link checks and history, starter packs, stats, weekly report, public API
lib/explore/         entries, the shared filter pipeline, map layouts, shareable URL state, starter code, compare, Ctrl+K palette
lib/logos/           logo suggestions: validation, review rules, public projection
lib/providers/       submission types, validation, review workflow, public projection
lib/server/          file store, rate limiting, reviewer sessions, config
lib/security/        secret detection and redaction
lib/saved.ts         saved APIs, kept in the browser's localStorage (lib/exportList.ts exports them)
lib/site.ts          site name, repository links, static-mode and base-path settings
scripts/             importer, logo tools, link checker, weekly report, static build, demo recorder, secret scanner
data/                committed snapshot, changelog.json, link-health.json, link-history.json, glyphs, ai-models.json, community-logos.json, upstream README + LICENSE
.github/             CI, Lighthouse, Pages deploy, weekly catalog sync, releases, Dependabot, issue forms
docs/media/          README GIF and screenshots
tests/unit, tests/e2e
```

## Dependency audit

`npm audit --omit=dev` reports **no vulnerabilities** in anything the website ships, and CI
fails if that ever changes (`npm audit --omit=dev --audit-level=high`).

Development tools are up to date: Vitest 5.0.5 (fixes the Vitest and `tinypool` advisories),
sharp 0.35.5 (fixes the libvips, libheif and librsvg advisories), Next.js's internal PostCSS is
overridden to 8.5.25, and Playwright is 1.58.2. One advisory remains in development only:
**braces** (GHSA-vfj7-8cjw-p6xm), pulled in by the Next.js ESLint plugin. No fixed version has
been published, and it only runs during `npm run lint` on this repository's own files.
Do not run `npm audit fix --force`; it downgrades `eslint-config-next` to 14.x.

Dependabot (`.github/dependabot.yml`) groups routine updates into one weekly npm pull request
and one monthly GitHub Actions pull request.

## License and attribution

Catalog content: MIT License, Copyright (c) 2022 public-apis — see
`data/upstream/LICENSE`. Entries are community-sourced; confirm current documentation,
terms and availability with each provider. A listing does not mean an API is free, live
or safe to call.
