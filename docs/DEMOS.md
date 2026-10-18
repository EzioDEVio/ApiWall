# In-site demos: why they are off, and what turning one on requires

ApiWall ships with **no in-site demos**. The `/api/demos/[id]` route always returns
404 and never forwards a request anywhere. The detail panel states "No in-site demo
is offered for this listing" and never renders a "Try demo" control.

Demos stay disabled because this project has no secret manager or encrypted
server-only configuration in which a provider credential could be stored safely.

## Before any demo can be enabled

An administrator must first provide all of the following, and a reviewer must
approve the specific demo:

1. **Explicit provider authorisation** in writing, naming the endpoints/models, the
   quota, the cost owner, eligibility and expiration terms. "Free" must be tied to a
   verified quota and a named payer.
2. **Secret storage** in a server-side secret manager (for example a cloud KMS-backed
   secret store). The key must never appear in HTML, client bundles, browser storage,
   public API responses, URLs, analytics, logs, error reports or source control.
   Use least-privilege, demo-only credentials that the provider can revoke.
3. **A fixed allowlist** of provider + endpoint + model combinations. The client sends
   only a demo ID and validated parameters; the server builds the outbound request.
   No arbitrary target URLs are accepted, so the route cannot become an open proxy.
4. **Request validation**: a strict schema per demo, request-size limits and timeouts.
5. **Abuse and cost controls**: per-visitor and per-provider rate limits, a hard daily
   and monthly spend cap enforced server-side, and an emergency kill switch that
   disables the demo without a deploy.
6. **Visitor disclosures shown before use**: quota and terms, a privacy notice saying
   what is sent to the provider, the provider contact, and a report-abuse path.
7. **Monitoring with redaction**: request logs must pass through `redact()` in
   `lib/security/secrets.ts`, and must never record prompts or keys verbatim.

Only after all of the above may the reviewer verify a `provider-sponsored-demo`
access claim. Until a demo route implementing these controls exists,
`applyReviewAction` refuses to verify that status.

Bring-your-own-key is out of scope: there is no secure, user-scoped secret storage,
and user keys must never be placed in URLs or shared browser storage.
