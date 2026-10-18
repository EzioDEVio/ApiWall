import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  { ignores: [".next/**", "node_modules/**", "test-results/**", "playwright-report/**", "next-env.d.ts", "data/runtime/**", "out/**", ".static-stash/**"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default config;
