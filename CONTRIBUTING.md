# Contributing to ApiWall

Thanks for helping. Most contributions take two minutes and need no setup.

## No code needed

Use the issue forms (they open pre-filled when you start from a tile on the site):

- **Add an API**: suggest a public API, or your own.
- **Suggest a logo**: drag in the provider's official logo and link where they publish it.
- **Report a listing**: a broken link, wrong details, or an API that shut down.

Never paste API keys, tokens or passwords. Issues are public.

Facts that come from [public-apis](https://github.com/public-apis/public-apis) (auth,
HTTPS, CORS, category) are best fixed upstream; the weekly sync brings them in.

## Working on the code

```bash
npm install
npm run dev            # http://localhost:3000
```

Before opening a pull request:

```bash
npm run lint && npm run typecheck && npm test
npm run build && npm run test:e2e     # browser + accessibility tests (run `npx playwright install chromium` once)
npm run build:static                  # the GitHub Pages build still works
```

Keep pull requests focused, describe what changed and how you checked it, and include a
screenshot for visual changes at desktop and phone widths.

## Good first issues

New here? Issues labelled [`good first issue`](https://github.com/EzioDEVio/ApiWall/labels/good%20first%20issue)
are small and come with pointers. Some ideas that are always open:

- **Give an API its real logo.** Pick a monogram tile on the wall (filter: _No logo yet_) and add the
  provider's official mark with `npm run logos:add`.
- **Fix a dead docs link.** The pinned _Docs-link health_ issue lists every link that failed the
  weekly check. Find the new address and fix it upstream in public-apis, or report it here.
- **Propose a starter pack.** Packs live in `lib/catalog/packs.ts`. A pack is a rule over facts the
  catalog already records (category, auth, HTTPS, CORS, docs-link check), never a hand-picked
  ranking. Add one entry and a line to the unit tests.
- **Improve a category page or an empty state.** Screenshots at phone and desktop width help review.

## Where things live

| Area                                         | Files                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------- |
| The wall, list, filters, Ctrl+K              | `components/Explore.tsx`, `components/Mosaic.tsx`, `lib/explore/`               |
| API, category, pack and stats pages          | `app/apis/`, `app/categories/`, `app/packs/`, `app/stats/`                      |
| Catalog import, logos, link checks           | `scripts/import-catalog.ts`, `scripts/fetch-logos.ts`, `scripts/check-links.ts` |
| Public JSON API and badges                   | `lib/catalog/publicApi.ts` (served at `/api/v1/`)                               |
| Weekly report (README section, health issue) | `lib/catalog/syncReport.ts`, `scripts/sync-report.ts`                           |
| Unit and browser tests                       | `tests/unit/`, `tests/e2e/`                                                     |

## Labels

| Label              | Meaning                           |
| ------------------ | --------------------------------- |
| `good first issue` | Small, well-scoped, with pointers |
| `help wanted`      | Bigger, and we would love a hand  |
| `catalog`          | Weekly sync pull requests         |
| `link-health`      | The weekly docs-link report       |
| `dependencies`     | Dependabot updates                |

Pull request labels also sort the automatic release notes (see `.github/release.yml`):
`feature`, `fix`, `catalog`, `dependencies`, `docs`.

## Releases

Maintainers publish a release by pushing a version tag (`git tag v1.5.0 && git push origin v1.5.0`)
or by running the **Release** workflow from the Actions tab. GitHub writes the notes from the
merged pull requests since the previous tag.

## For maintainers: reviewing requests

Use the admin page (`/admin/`, see "Requests and roles" in the README): approving there applies
the request through a pull request that merges itself once checks pass. Adding the `approved`
label in GitHub works too for new APIs, provider listings and logos (the request is applied as
submitted); corrections need the admin page, where you choose what changes.

## For maintainers: adding a logo from an issue

1. Download the image from the issue and check it is the provider's own logo.
2. Run `npm run logos:add -- "<listing name or id>" path/to/logo.png <https source page>`.
3. Commit `public/marks/community/`, `data/community-logos.json` and `data/catalog.snapshot.json`,
   and close the issue from the commit (`Closes #123`).

Logos approved in the self-hosted `/review` area can be copied into the repo with
`npm run logos:promote`.

## Ground rules

- Be kind and assume good intent.
- Do not add claims about pricing or free tiers without a source and a date checked.
- Do not imply that ApiWall is affiliated with public-apis or with any listed provider.
