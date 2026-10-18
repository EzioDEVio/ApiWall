import type { Entry } from "./model";

export interface CodeSample {
  id: "curl" | "js" | "python";
  label: string;
  code: string;
}
export interface Samples {
  base: string; // base URL used in the samples
  baseKnown: boolean; // true when the catalog or checked docs give the API host
  notes: string[];
  samples: CodeSample[];
}

/**
 * Starter code for calling an API. Nothing is invented: when the catalog link is an API
 * host (api.*) or the docs were checked (AI Models) it is used as the base URL; otherwise
 * the sample uses a placeholder and says where to find the real endpoint. Keys come from
 * environment variables and are never written into the code.
 */
export function codeSamples(e: Entry): Samples | null {
  if (e.kind !== "api" || !e.url) return null;
  let host: URL | null = null;
  try {
    host = new URL(e.url);
  } catch {
    return null;
  }
  const fromDocs = e.aiModel?.apiHost ? `https://${e.aiModel.apiHost.replace(/\/$/, "")}` : null;
  const fromLink = /^api\./.test(host.hostname) ? host.origin : null;
  const base = fromDocs ?? fromLink ?? "https://API_HOST";
  const baseKnown = !!(fromDocs ?? fromLink);
  const path = "/PATH_FROM_THE_DOCS";
  const url = `${base}${path}`;

  // How credentials are sent.
  const detail = e.aiModel?.authDetail ?? "";
  const headerName = /x-goog-api-key/i.test(detail) ? "x-goog-api-key" : e.auth === "x-mashape-key" ? "X-Mashape-Key" : "Authorization";
  const bearer = headerName === "Authorization";
  const envVar = e.auth === "oauth" ? "ACCESS_TOKEN" : "API_KEY";
  const needsKey = e.auth === "apiKey" || e.auth === "oauth" || e.auth === "x-mashape-key";
  const headerValue = (v: string) => (bearer ? `Bearer ${v}` : v);

  const notes: string[] = [];
  if (!baseKnown) notes.push(`Replace API_HOST and the path with an endpoint from the official docs (${host.hostname}).`);
  else notes.push(`Replace ${path} with an endpoint from the docs.`);
  if (e.auth === "apiKey" && !e.aiModel) notes.push("Uses an API key. The docs say whether it goes in a header or a query parameter; adjust if needed.");
  if (e.auth === "oauth") notes.push("Uses OAuth: get an access token through the provider's sign-in flow first.");
  if (e.auth === "user-agent") notes.push("The catalog says this API expects a descriptive User-Agent header.");
  if (e.auth === "unknown" || e.auth === "other") notes.push(`The catalog lists auth as “${e.raw.auth || "unknown"}”. Check the docs.`);
  if (needsKey) notes.push(`Keep the ${envVar === "API_KEY" ? "key" : "token"} in an environment variable on your server. Never put it in front-end code or commit it.`);
  if (e.cors !== "yes") notes.push(e.cors === "no" ? "CORS: No. Browsers will block direct calls; call it from your server." : "CORS is unknown, so browser calls may be blocked. A server is the safe choice.");
  if (e.https === "no") notes.push("Listed without HTTPS: traffic would not be encrypted.");

  const ua = e.auth === "user-agent";
  const curl = [
    `# ${e.name}: ${e.url}`,
    `curl "${url}"${needsKey || ua ? " \\" : ""}`,
    ...(needsKey ? [`  -H "${headerName}: ${headerValue(`$${envVar}`)}"${ua ? " \\" : ""}`] : []),
    ...(ua ? [`  -H "User-Agent: my-app/1.0 (me@example.com)"`] : []),
  ].join("\n");

  const jsHeaders = [
    ...(needsKey ? [`    "${headerName}": ${bearer ? "`Bearer ${process.env." + envVar + "}`" : `process.env.${envVar}`},`] : []),
    ...(ua ? [`    "User-Agent": "my-app/1.0 (me@example.com)",`] : []),
  ];
  const js = [
    `// ${e.name}: ${e.url}`,
    `const res = await fetch("${url}"${jsHeaders.length ? ", {" : ");"}`,
    ...(jsHeaders.length ? ["  headers: {", ...jsHeaders, "  },", "});"] : []),
    `if (!res.ok) throw new Error(\`HTTP \${res.status}\`);`,
    `const data = await res.json();`,
    `console.log(data);`,
  ].join("\n");

  const pyHeaders = [
    ...(needsKey ? [`    "${headerName}": ${bearer ? `f"Bearer {os.environ['${envVar}']}"` : `os.environ["${envVar}"]`},`] : []),
    ...(ua ? [`    "User-Agent": "my-app/1.0 (me@example.com)",`] : []),
  ];
  const python = [
    `# ${e.name}: ${e.url}`,
    ...(needsKey ? ["import os", ""] : []),
    "import requests",
    "",
    pyHeaders.length ? `res = requests.get("${url}", headers={\n${pyHeaders.join("\n")}\n}, timeout=30)` : `res = requests.get("${url}", timeout=30)`,
    "res.raise_for_status()",
    "print(res.json())",
  ].join("\n");

  return {
    base,
    baseKnown,
    notes,
    samples: [
      { id: "curl", label: "curl", code: curl },
      { id: "js", label: "JavaScript", code: js },
      { id: "python", label: "Python", code: python },
    ],
  };
}
