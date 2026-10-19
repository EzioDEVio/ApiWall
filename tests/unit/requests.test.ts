import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { attachmentUrl, parseForm, parseSections, requestKind } from "@/lib/requests/forms";
import { type Approval, approvalComment, ApprovalSchema, canApprove, canTriage, readApproval, roleOf } from "@/lib/requests/approval";
import { applyToFiles, checkAgainstCatalog, defaultApproval, describeApproval, matchCategory } from "@/lib/requests/apply";
import { applyCommunityApis, applyOverrides, EMPTY_COMMUNITY_APIS, EMPTY_OVERRIDES } from "@/lib/catalog/requests";
import { buildEntries } from "@/lib/explore/model";
import type { CatalogSnapshot } from "@/lib/catalog/types";

const root = process.cwd();
const snap = JSON.parse(readFileSync(path.join(root, "data/catalog.snapshot.json"), "utf8")) as CatalogSnapshot;
const weather = snap.listings.find((l) => l.categorySlug === "weather" && l.origin !== "community")!;
const meta = { issue: 7, approvedBy: "theslash84", approvedAt: "2026-10-19" };

const addApiBody = `### API name

Acme Weather

### Official documentation URL (https)

https://docs.acme-weather.example.com/api

### Category

Weather APIs

### Short description

Forecasts and current
conditions for any city.

### Authentication

API key

### HTTPS

Yes

### CORS (can browsers call it directly?)

Not sure

### Where are pricing or free-tier terms published? (optional, https)

_No response_

### Before you submit

- [X] This issue contains no API keys, tokens or passwords.`;

describe("issue forms", () => {
  it("every form heading in the parser exists in its GitHub template", () => {
    const files: Record<string, string> = { "add-api": "add-api.yml", provider: "place-api.yml", logo: "suggest-logo.yml", listing: "report-listing.yml" };
    for (const [kind, file] of Object.entries(files)) {
      const yml = readFileSync(path.join(root, ".github/ISSUE_TEMPLATE", file), "utf8");
      expect(yml, file).toContain(`labels: [${kind === "add-api" ? "add-api" : kind}]`);
      const form = parseForm(kind as never, "");
      for (const id of Object.keys(form)) expect(yml, `${file} field ${id}`).toMatch(new RegExp(`id: ${id}\\n`));
    }
  });
  it("reads fields, empty answers and the request kind", () => {
    expect(requestKind(["bug", "add-api"])).toBe("add-api");
    expect(requestKind(["provider"])).toBe("provider");
    expect(requestKind(["bug"])).toBeNull();
    const f = parseForm("add-api", addApiBody);
    expect(f.name).toBe("Acme Weather");
    expect(f.source).toBe("");
    expect(parseSections("no headings").size).toBe(0);
  });
  it("only accepts images uploaded to GitHub itself", () => {
    expect(attachmentUrl("![x](https://github.com/user-attachments/assets/0f5e6b3a-1234-4abc-9def-0123456789ab)")).toBe(
      "https://github.com/user-attachments/assets/0f5e6b3a-1234-4abc-9def-0123456789ab",
    );
    expect(attachmentUrl("![x](https://evil.example/logo.png)")).toBeNull();
  });
  it("matches typed categories to real ones", () => {
    expect(matchCategory("Weather APIs", snap)).toBe("weather");
    expect(matchCategory("weather", snap)).toBe("weather");
    expect(matchCategory("MCP Servers", snap)).toBeNull(); // not a category a new HTTP API can join
    expect(matchCategory("", snap)).toBeNull();
  });
});

describe("approvals", () => {
  it("turns a submitted form into a valid approval, and round-trips it through the comment", () => {
    const d = defaultApproval("add-api", parseForm("add-api", addApiBody), snap);
    expect(d.approval).toEqual({
      kind: "add-api",
      name: "Acme Weather",
      url: "https://docs.acme-weather.example.com/api",
      categorySlug: "weather",
      description: "Forecasts and current conditions for any city.",
      auth: "apiKey",
      https: "Yes",
      cors: "Unknown",
    });
    const comment = approvalComment(d.approval!, "✅ Approved");
    expect(comment.startsWith("✅ Approved\n\n<!-- apiwall-approval:v1 ")).toBe(true);
    expect(readApproval(comment)).toEqual({ ok: true, approval: d.approval });
  });
  it("rejects unsafe or incomplete approvals", () => {
    const base = { kind: "add-api", name: "X", url: "https://x.example", categorySlug: "weather", description: "d", auth: "No", https: "Yes", cors: "Yes" };
    expect(ApprovalSchema.safeParse(base).success).toBe(true);
    expect(ApprovalSchema.safeParse({ ...base, url: "http://x.example" }).success).toBe(false);
    expect(ApprovalSchema.safeParse({ ...base, url: "javascript:alert(1)" }).success).toBe(false);
    expect(ApprovalSchema.safeParse({ ...base, description: "<img src=x onerror=alert(1)>" }).success).toBe(false);
    expect(ApprovalSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
    expect(ApprovalSchema.safeParse({ kind: "listing", listingId: weather.id, action: "update" }).success).toBe(false);
    expect(ApprovalSchema.safeParse({ kind: "listing", listingId: weather.id, action: "hide" }).success).toBe(false);
    expect(
      ApprovalSchema.safeParse({ kind: "logo", listingId: weather.id, imageUrl: "https://evil.example/x.png", sourceUrl: "https://x.example" }).success,
    ).toBe(false);
    expect(readApproval("<!-- apiwall-approval:v1 bm90IGpzb24= -->").ok).toBe(false);
    expect(readApproval("just a comment").ok).toBe(false);
    expect(defaultApproval("listing", {}, snap).error).toMatch(/admin page/);
  });
  it("checks approvals against the catalog", () => {
    const dup = {
      kind: "add-api" as const,
      name: weather.name,
      url: weather.url!,
      categorySlug: "weather",
      description: "d",
      auth: "No" as const,
      https: "Yes" as const,
      cors: "Yes" as const,
    };
    expect(checkAgainstCatalog(dup, snap)[0]).toMatch(/already on the wall/);
    expect(checkAgainstCatalog({ ...dup, name: "Brand New", url: "https://brand-new.example/api", categorySlug: "nope" }, snap)).toEqual([
      'unknown category "nope"',
    ]);
    expect(checkAgainstCatalog({ kind: "listing", listingId: "api-does-not-exist", action: "hide", reason: "gone" }, snap)).toEqual([
      "no listing with ID api-does-not-exist",
    ]);
  });
  it("maps GitHub repository roles to ApiWall roles", () => {
    expect(["admin", "maintain", "write", "triage", "read", undefined].map(roleOf)).toEqual(["admin", "admin", "reviewer", "triage", "viewer", "viewer"]);
    expect(canApprove("reviewer")).toBe(true);
    expect(canApprove("triage")).toBe(false);
    expect(canTriage("triage")).toBe(true);
    expect(canTriage("viewer")).toBe(false);
  });
});

describe("applying approved requests", () => {
  it("adds a new API and a provider listing, each tied to its request", () => {
    const a = defaultApproval("add-api", parseForm("add-api", addApiBody), snap).approval as Extract<Approval, { kind: "add-api" }>;
    let files = applyToFiles(a, meta, { communityApis: EMPTY_COMMUNITY_APIS, overrides: EMPTY_OVERRIDES });
    files = applyToFiles(
      { ...a, kind: "provider", name: "Nimbus", url: "https://nimbus.example/docs", providerName: "Nimbus Inc" },
      { ...meta, issue: 8 },
      files,
    );
    // Approving the same request again replaces it rather than duplicating it.
    files = applyToFiles(a, meta, files);
    expect(files.communityApis.apis.map((x) => [x.issue, x.name, x.providerSubmitted ?? false])).toEqual([
      [7, "Acme Weather", false],
      [8, "Nimbus", true],
    ]);
    const { listings, warnings } = applyCommunityApis(snap.listings, files.communityApis);
    expect(warnings).toEqual([]);
    const added = listings.filter((l) => l.origin === "community");
    expect(added.map((l) => [l.name, l.category, l.community?.issue])).toEqual([
      ["Acme Weather", weather.category, 7],
      ["Nimbus", weather.category, 8],
    ]);
    const entries = buildEntries({ ...snap, listings }, null);
    expect(entries.find((e) => e.name === "Nimbus")!.community).toEqual({
      issue: 8,
      approvedAt: "2026-10-19",
      providerSubmitted: true,
      providerName: "Nimbus Inc",
    });
    expect(describeApproval(a, meta, snap).body).toContain("Closes #7");
  });
  it("corrects or removes a listing without editing upstream data, and marks what changed", () => {
    let files = applyToFiles({ kind: "listing", listingId: weather.id, action: "update", url: "https://moved.example/docs", cors: "Yes" }, meta, {
      communityApis: EMPTY_COMMUNITY_APIS,
      overrides: EMPTY_OVERRIDES,
    });
    let r = applyOverrides(snap.listings, files.overrides);
    const fixed = r.listings.find((l) => l.id === weather.id)!;
    expect(fixed.url).toBe("https://moved.example/docs");
    expect(fixed.cors).toBe("yes");
    expect(fixed.correction).toEqual({ issue: 7, approvedAt: "2026-10-19", fields: ["url", "cors"] });
    expect(snap.listings.find((l) => l.id === weather.id)!.correction).toBeUndefined(); // input untouched

    files = applyToFiles({ kind: "listing", listingId: weather.id, action: "hide", reason: "Shut down" }, meta, files);
    r = applyOverrides(snap.listings, files.overrides);
    expect(r.listings.some((l) => l.id === weather.id)).toBe(false);
    expect(r.listings.length).toBe(snap.listings.length - 1);
    expect(applyOverrides(snap.listings, { version: 1, overrides: { "api-gone": { ...meta, hidden: true } } }).warnings[0]).toMatch(/matches no listing/);
  });
  it("starts with empty request files in the repository", () => {
    expect(JSON.parse(readFileSync(path.join(root, "data/listing-overrides.json"), "utf8")).version).toBe(1);
    expect(JSON.parse(readFileSync(path.join(root, "data/community-apis.json"), "utf8")).version).toBe(1);
  });
});
