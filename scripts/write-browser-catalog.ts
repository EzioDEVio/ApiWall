// Writes the slim browser catalog for the static site: tsx scripts/write-browser-catalog.ts out/catalog.json
import { writeFileSync } from "node:fs";
import { readSnapshot } from "../lib/catalog/files";
import path from "node:path";
import { toBrowserCatalog } from "../lib/catalog/browser";

const root = path.resolve(__dirname, "..");
const target = path.resolve(root, process.argv[2] ?? "out/catalog.json");
const snap = readSnapshot(root);
writeFileSync(target, JSON.stringify(toBrowserCatalog(snap)));
