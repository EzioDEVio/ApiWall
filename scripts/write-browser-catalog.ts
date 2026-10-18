// Writes the slim browser catalog for the static site: tsx scripts/write-browser-catalog.ts out/catalog.json
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { toBrowserCatalog } from "../lib/catalog/browser";
import type { CatalogSnapshot } from "../lib/catalog/types";

const root = path.resolve(__dirname, "..");
const target = path.resolve(root, process.argv[2] ?? "out/catalog.json");
const snap = JSON.parse(readFileSync(path.join(root, "data", "catalog.snapshot.json"), "utf8")) as CatalogSnapshot;
writeFileSync(target, JSON.stringify(toBrowserCatalog(snap)));
