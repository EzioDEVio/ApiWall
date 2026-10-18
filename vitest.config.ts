import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "."), "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts") } },
  test: {
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    environment: "node",
  },
});
