// Runs before `npm start`: the server needs a server build, not the static one.
import { existsSync } from "node:fs";
import path from "node:path";

const next = path.resolve(__dirname, "..", ".next");
if (!existsSync(path.join(next, "BUILD_ID")) || existsSync(path.join(next, "STATIC_EXPORT"))) {
  console.error("✗ No server build to start. Run `npm run build` first (the last build was missing or was the static GitHub Pages build).");
  process.exit(1);
}
