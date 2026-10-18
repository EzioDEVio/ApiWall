import { rmSync } from "node:fs";

// Each run starts with an empty submission store.
export default function globalSetup() {
  rmSync("test-results/e2e-data", { recursive: true, force: true });
}
