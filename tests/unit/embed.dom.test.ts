// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const code = readFileSync(path.join(process.cwd(), "public/embed.js"), "utf8");
const BASE = "https://wall.example/ApiWall";

function load(html: string, responses: Record<string, unknown>) {
  document.body.innerHTML = html + `<script src="${BASE}/embed.js"></script>`;
  const fetchMock = vi.fn(async (url: string) => {
    const body = responses[url];
    return { ok: body !== undefined, status: body === undefined ? 404 : 200, json: async () => body } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  new Function(code)(); // runs like a classic <script>
  return fetchMock;
}
const settle = () => new Promise((r) => setTimeout(r, 0));
const shadow = (sel: string) => document.querySelector(sel)!.shadowRoot!;

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

const api = {
  id: "api-x",
  name: 'Evil <img src=x onerror="alert(1)">',
  description: "Facts",
  kind: "api",
  category: { slug: "animals", name: "Animals" },
  auth: { listed: "", type: "none" },
  https: true,
  cors: null,
  docsUrl: "javascript:alert(1)",
  pageUrl: "https://wall.example/ApiWall/apis/x/",
  logo: { url: "https://elsewhere.example/ApiWall/marks/tiles/x.webp", source: "https://x" },
  docsLink: { status: "unreachable", checkedOn: "2026-10-19", failingSince: "2026-10-19", reason: "timed out" },
};

describe("embed.js", () => {
  it("renders an API card as text only, in a shadow root, with safe links", async () => {
    const fetchMock = load('<div data-apiwall-api="api-x"></div>', { [`${BASE}/api/v1/apis/api-x.json`]: { data: api } });
    await settle();
    await settle();
    expect(fetchMock).toHaveBeenCalledWith(`${BASE}/api/v1/apis/api-x.json`);
    const root = shadow("[data-apiwall-api]");
    expect(root.querySelector(".name")!.textContent).toBe(api.name);
    expect(root.querySelector("img[onerror]")).toBeNull();
    const hrefs = [...root.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs.some((h) => h!.startsWith("javascript:"))).toBe(false);
    expect(hrefs).toContain(api.pageUrl);
    // Logos always come from the host the script was loaded from.
    expect(root.querySelector(".logo img")!.getAttribute("src")).toBe(`${BASE}/marks/tiles/x.webp`);
    expect(root.textContent).toContain("No auth");
    expect(root.textContent).toContain("Docs link down");
    // The host page is untouched apart from the shadow root.
    expect(document.querySelector("[data-apiwall-api]")!.innerHTML).toBe("");
  });
  it("lists a category up to the limit", async () => {
    const data = Array.from({ length: 9 }, (_, i) => ({ ...api, id: `api-${i}`, name: `API ${i}`, logo: null }));
    load('<div data-apiwall-category="animals" data-limit="3"></div>', { [`${BASE}/api/v1/categories/animals.json`]: { category: { slug: "animals", name: "Animals" }, data } });
    await settle();
    await settle();
    const root = shadow("[data-apiwall-category]");
    expect(root.querySelectorAll("li")).toHaveLength(3);
    expect(root.textContent).toContain("See all 9");
  });
  it("refuses odd IDs without fetching, and shows a fallback link when loading fails", async () => {
    const fetchMock = load('<div data-apiwall-api="../../secret"></div><div data-apiwall-api="api-missing"></div>', {});
    await settle();
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    for (const el of document.querySelectorAll("[data-apiwall-api]")) expect(el.shadowRoot!.textContent).toContain("could not load");
  });
});
