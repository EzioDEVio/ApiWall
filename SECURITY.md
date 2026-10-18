# Security policy

## Reporting a vulnerability

Please report security issues privately through GitHub:
**Security → Report a vulnerability** on this repository
(<https://github.com/EzioDEVio/ApiWall/security/advisories/new>).
Do not open a public issue. Expect an acknowledgement within a few days. Confirmed issues get a fix
or a decision within 30 days; please wait for that before disclosing publicly.

## Scope and design notes

- The GitHub Pages site is static: no server, no accounts, no stored user data. It never
  calls the listed APIs and never asks for keys.
- The self-hosted version adds provider submissions and a reviewer area. Submissions
  refuse anything that looks like a credential, uploads are checked by their bytes (no
  SVG), reviewer sessions are HMAC-signed HttpOnly cookies, and state-changing requests
  must come from the same origin.
- `npm run check:secrets` scans source and the built client bundle for credentials.
- The public JSON API (`/api/v1/`) and `embed.js` are read-only. The embed card renders in a
  shadow root using text nodes only, follows only http(s) links and loads logos from ApiWall.
- Dependencies: CI fails if `npm audit --omit=dev` finds a high or critical issue in what the
  site ships; Dependabot keeps npm packages and GitHub Actions current. Known development-only
  advisories are listed in the README under "Dependency audit".
- Workflows use least-privilege `permissions` and pinned runner images.

If you find a key, token or personal data committed anywhere in this repository, report it
the same way so it can be removed and rotated.
