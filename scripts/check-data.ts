/*
 * Runs before `npm run dev`, `npm run build` and `npm start`. Stops with a
 * clear instruction when the catalog snapshot is missing, instead of a stack
 * trace from deep inside the build.
 */
import { existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const missing = ["data/catalog.snapshot.json", "data/glyphs.json"].filter((f) => !existsSync(path.join(root, f)));

if (missing.length) {
  console.error(`
✗ The catalog data is missing (${missing.join(", ")}).

  Create it from the public-apis list (needs internet, about 10 seconds):

      npm run catalog:import

  Then, optionally, download every API's logo (about 3 minutes):

      npm run catalog:logos
`);
  process.exit(1);
}

const marks = path.join(root, "public", "marks");
if (!existsSync(path.join(root, "data", "favicons.json")) && existsSync(marks)) {
  console.log("ℹ No downloaded logos yet. Run `npm run catalog:logos` to fetch them (optional).");
}
