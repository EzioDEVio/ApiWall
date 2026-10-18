// Small, dependency-free registrable-domain helper. It covers the generic and
// country-code second-level suffixes that appear in the catalog; anything it
// does not know falls back to the last two labels.
const TWO_PART_SUFFIXES = new Set([
  "co.uk", "org.uk", "gov.uk", "ac.uk", "ltd.uk", "me.uk", "com.au", "net.au", "org.au", "gov.au", "edu.au",
  "com.br", "gov.br", "org.br", "co.jp", "or.jp", "go.jp", "ne.jp", "co.kr", "or.kr", "go.kr", "co.in", "gov.in",
  "nic.in", "org.in", "co.nz", "govt.nz", "org.nz", "com.mx", "gob.mx", "com.ar", "gob.ar", "com.tr", "gov.tr",
  "com.cn", "gov.cn", "org.cn", "com.tw", "gov.tw", "com.sg", "gov.sg", "co.za", "gov.za", "com.hk", "gov.hk",
  "com.my", "gov.my", "co.id", "go.id", "com.pe", "gob.pe", "com.co", "gov.co", "gob.es", "gouv.fr", "co.il",
  "gov.il", "com.ua", "gov.ua", "com.pl", "gov.pl", "com.vn", "gov.vn", "com.ph", "gov.ph", "co.th", "go.th",
]);

/** Hosts shared by many unrelated projects; matching them proves nothing about ownership. */
export const SHARED_HOSTS = new Set([
  "github.com", "github.io", "gitlab.com", "gitlab.io", "bitbucket.org", "wikipedia.org", "wikimedia.org",
  "herokuapp.com", "netlify.app", "vercel.app", "pages.dev", "workers.dev", "glitch.me", "readthedocs.io",
  "gitbook.io", "rapidapi.com", "postman.com", "swaggerhub.com", "apiary.io", "medium.com", "notion.site",
  "blogspot.com", "wordpress.com", "web.app", "firebaseapp.com", "appspot.com", "azurewebsites.net",
  "amazonaws.com", "onrender.com", "fly.dev", "railway.app", "deno.dev", "repl.co", "npmjs.com", "pypi.org",
  "sourceforge.net", "withgoogle.com",
]);

export function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function registrableDomain(host: string): string {
  const parts = host.toLowerCase().split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  const lastTwo = parts.slice(-2).join(".");
  return TWO_PART_SUFFIXES.has(lastTwo) ? parts.slice(-3).join(".") : lastTwo;
}

/** GitHub/GitLab organisation for a repository URL, e.g. "spotify" for github.com/spotify/web-api. */
export function codeHostOwner(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "github.com" || host === "gitlab.com") {
      const owner = u.pathname.split("/")[1];
      return owner ? `${host}/${owner.toLowerCase()}` : null;
    }
    if (host.endsWith(".github.io")) return `github.com/${host.split(".")[0]}`;
  } catch {
    /* fall through */
  }
  return null;
}
