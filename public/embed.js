/*!
 * ApiWall embed: shows an ApiWall card for one API, or a short list for a category, on any site.
 *
 *   <div data-apiwall-api="api-openai-api-1rmb4o81bp"></div>
 *   <div data-apiwall-category="weather" data-limit="6"></div>
 *   <script src="https://eziodevio.github.io/ApiWall/embed.js" async></script>
 *
 * Options: data-theme="light" | "dark" (default: follows the visitor's system setting).
 * The card renders inside a shadow root, so it never inherits or changes the host page's styles.
 * Nothing is tracked; the only requests are to ApiWall's public JSON and logo files.
 */
(function () {
  "use strict";
  var script =
    document.currentScript ||
    (function () {
      var all = document.querySelectorAll('script[src$="/embed.js"]');
      return all[all.length - 1];
    })();
  if (!script) return;
  var BASE = script.src.replace(/\/embed\.js(?:[?#].*)?$/, "");
  var API = BASE + "/api/v1/";
  var ID_RE = /^[a-z0-9-]{1,120}$/;

  var CSS =
    ":host{all:initial;display:block;max-width:560px;font:14px/1.45 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;" +
    "--bg:#fff;--ink:#16181d;--muted:#5b6170;--line:#e2e4ea;--accent:#3d3df5;--chip:#f1f2f5}" +
    ":host([data-dark]){--bg:#15171d;--ink:#eef0f5;--muted:#a3a9b8;--line:#2b2f3a;--accent:#8f8fff;--chip:#22252e}" +
    ".card{border:1px solid var(--line);border-radius:14px;background:var(--bg);color:var(--ink);padding:14px 16px;box-sizing:border-box}" +
    ".head{display:flex;gap:12px;align-items:center}" +
    ".logo{width:44px;height:44px;flex:none;border-radius:10px;border:1px solid var(--line);background:#fff;display:grid;place-items:center;overflow:hidden}" +
    ".logo img{width:70%;height:70%;object-fit:contain}" +
    ".mono{width:44px;height:44px;flex:none;border-radius:10px;display:grid;place-items:center;font-weight:700;color:#fff;background:var(--accent)}" +
    ".name{font-weight:700;font-size:16px;margin:0;color:var(--ink);text-decoration:none}" +
    ".name:hover{text-decoration:underline}" +
    ".cat{color:var(--muted);font-size:12px}" +
    ".desc{margin:10px 0 0;color:var(--ink)}" +
    ".chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}" +
    ".chip{font:12px ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--chip);color:var(--muted);border-radius:5px;padding:2px 7px}" +
    ".chip.down{color:#c0262d}" +
    ".foot{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:12px;padding-top:10px;border-top:1px solid var(--line);font-size:13px}" +
    "a{color:var(--accent)}" +
    "ul{list-style:none;margin:10px 0 0;padding:0;display:grid;gap:6px}" +
    "li a{display:flex;gap:10px;align-items:center;text-decoration:none;color:var(--ink);padding:6px;border-radius:8px}" +
    "li a:hover{background:var(--chip)}" +
    "li .logo,li .mono{width:30px;height:30px;border-radius:8px;font-size:12px}" +
    ".row-name{font-weight:600}.row-desc{color:var(--muted);font-size:12px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:420px}" +
    ".brand{color:var(--muted)}";

  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    return n;
  }
  function safeUrl(u) {
    try {
      var p = new URL(u);
      return p.protocol === "https:" || p.protocol === "http:" ? p.href : null;
    } catch {
      return null;
    }
  }
  function link(href, text, cls) {
    var a = el("a", { href: safeUrl(href) || BASE + "/", target: "_blank", rel: "noopener", class: cls || null }, text);
    return a;
  }
  // Logos are served by ApiWall itself; keep them on the same host the script came from.
  function logoUrl(api) {
    if (!api.logo || !api.logo.url) return null;
    var i = api.logo.url.indexOf("/marks/");
    return i < 0 ? null : BASE + api.logo.url.slice(i);
  }
  var SVG = "http://www.w3.org/2000/svg";
  function brand(api) {
    var h = String(api.brandIcon.hex || "");
    var hex = "#16181d";
    if (/^[0-9a-fA-F]{6}$/.test(h)) {
      var n = parseInt(h, 16);
      var lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
      if (lum < 0.85) hex = "#" + h; // very light brand colours would vanish on the white tile
    }
    var box = el("span", { class: "logo" });
    var svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "60%");
    svg.setAttribute("height", "60%");
    svg.setAttribute("aria-hidden", "true");
    var path = document.createElementNS(SVG, "path");
    path.setAttribute("d", String(api.brandIcon.svgPath).replace(/[^0-9a-zA-Z.,\s-]/g, ""));
    path.setAttribute("fill", hex);
    svg.appendChild(path);
    box.appendChild(svg);
    return box;
  }
  function mark(api) {
    if (!logoUrl(api) && api.brandIcon && api.brandIcon.svgPath) return brand(api);
    var src = logoUrl(api);
    if (src) {
      var box = el("span", { class: "logo" });
      var img = el("img", { src: src, alt: "", loading: "lazy" });
      img.onerror = function () {
        box.replaceWith(mono(api));
      };
      box.appendChild(img);
      return box;
    }
    return mono(api);
  }
  function mono(api) {
    var words = String(api.name || "?").split(/\s+/);
    return el("span", { class: "mono", "aria-hidden": "true" }, ((words[0] || "?")[0] + ((words[1] || "")[0] || "")).toUpperCase());
  }
  function authText(api) {
    return api.auth && api.auth.type === "none" ? "No auth" : (api.auth && api.auth.listed) || "Auth unknown";
  }
  function pageOf(api) {
    return api.pageUrl || api.wallUrl || BASE + "/";
  }
  function shorten(s, n) {
    s = String(s || "");
    return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s;
  }
  function brandLine(href, text) {
    var p = el("div", { class: "foot" });
    p.appendChild(link(href, text));
    p.appendChild(el("span", { class: "brand" }, "via ApiWall"));
    return p;
  }

  function apiCard(api) {
    var card = el("div", { class: "card" });
    var head = el("div", { class: "head" });
    head.appendChild(mark(api));
    var t = el("div");
    t.appendChild(link(pageOf(api), api.name, "name"));
    t.appendChild(el("div", { class: "cat" }, api.kind === "mcp" ? "MCP server" : (api.category && api.category.name) + " API"));
    head.appendChild(t);
    card.appendChild(head);
    if (api.description) card.appendChild(el("p", { class: "desc" }, shorten(api.description, 160)));
    var chips = el("div", { class: "chips" });
    chips.appendChild(el("span", { class: "chip" }, authText(api)));
    if (api.kind !== "mcp") {
      chips.appendChild(el("span", { class: "chip" }, "HTTPS " + (api.https === true ? "yes" : api.https === false ? "no" : "?")));
      chips.appendChild(el("span", { class: "chip" }, "CORS " + (api.cors === true ? "yes" : api.cors === false ? "no" : "?")));
    }
    if (api.docsLink && api.docsLink.status === "unreachable") chips.appendChild(el("span", { class: "chip down" }, "Docs link down"));
    card.appendChild(chips);
    var foot = el("div", { class: "foot" });
    if (safeUrl(api.docsUrl)) foot.appendChild(link(api.docsUrl, "Official docs ↗"));
    foot.appendChild(link(pageOf(api), "Details on ApiWall"));
    card.appendChild(foot);
    return card;
  }

  function categoryCard(body, limit) {
    var card = el("div", { class: "card" });
    var url = BASE + "/categories/" + body.category.slug + "/";
    card.appendChild(link(url, body.category.name + " APIs", "name"));
    card.appendChild(el("div", { class: "cat" }, body.data.length + " public APIs on ApiWall"));
    var ul = el("ul");
    body.data.slice(0, limit).forEach(function (api) {
      var li = el("li");
      var a = link(pageOf(api), null);
      a.appendChild(mark(api));
      var t = el("span");
      t.appendChild(el("span", { class: "row-name" }, api.name));
      t.appendChild(el("span", { class: "row-desc" }, authText(api) + " · " + shorten(api.description, 80)));
      a.appendChild(t);
      li.appendChild(a);
      ul.appendChild(li);
    });
    card.appendChild(ul);
    card.appendChild(brandLine(url, "See all " + body.data.length + " →"));
    return card;
  }

  function fail(root, href) {
    var card = el("div", { class: "card" });
    card.appendChild(el("div", { class: "cat" }, "This ApiWall card could not load."));
    card.appendChild(brandLine(href, "Open ApiWall"));
    root.appendChild(card);
  }

  function render(host) {
    if (host.__apiwall) return;
    host.__apiwall = true;
    var theme = host.getAttribute("data-theme");
    var dark = theme === "dark" || (theme !== "light" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    if (dark) host.setAttribute("data-dark", "");
    root.appendChild(el("style", null, CSS));
    var id = host.getAttribute("data-apiwall-api");
    var cat = host.getAttribute("data-apiwall-category");
    var limit = Math.max(1, Math.min(12, parseInt(host.getAttribute("data-limit") || "6", 10) || 6));
    var key = id || cat;
    if (!key || !ID_RE.test(key)) return fail(root, BASE + "/");
    var url = id ? API + "apis/" + id + ".json" : API + "categories/" + cat + ".json";
    fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then(function (body) {
        root.appendChild(id ? apiCard(body.data) : categoryCard(body, limit));
      })
      .catch(function () {
        fail(root, id ? BASE + "/?api=" + id : BASE + "/categories/" + cat + "/");
      });
  }

  function scan() {
    var nodes = document.querySelectorAll("[data-apiwall-api],[data-apiwall-category]");
    for (var i = 0; i < nodes.length; i++) render(nodes[i]);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scan);
  else scan();
})();
