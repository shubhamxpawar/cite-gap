import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

// Next.js 15 ships eslintrc-style configs (eslint-config-next 15 has no flat
// entrypoints), so bridge them with FlatCompat.
const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [".next/**", "out/**", "build/**", "next-env.d.ts", "pgdata/**"],
  },
];

export default eslintConfig;
