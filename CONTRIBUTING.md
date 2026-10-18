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
npm run build && npm run test:e2e     # browser tests (run `npx playwright install chromium` once)
npm run build:static                  # the GitHub Pages build still works
```

Keep pull requests focused, describe what changed and how you checked it, and include a
screenshot for visual changes at desktop and phone widths.

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
