import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Agent worktrees (each has its own .next) and video sources are not app code.
    ".claude/**",
    "motion/**",
    // Vendored by the shadcn / AI Elements CLIs; updated with the CLI, not by hand.
    "src/components/ui/**",
    "src/components/ai-elements/**",
  ]),
]);

export default eslintConfig;
