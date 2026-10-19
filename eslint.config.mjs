import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Next.js 16 ships flat configs, so no compatibility layer is needed.
const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "test-results/**",
      "playwright-report/**",
      "next-env.d.ts",
      "data/runtime/**",
      "out/**",
      ".static-stash/**",
      ".lighthouseci/**",
    ],
  },
  ...nextVitals,
  ...nextTs,
];

export default config;
