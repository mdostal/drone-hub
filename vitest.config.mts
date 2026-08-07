import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Shared Vitest config for the whole repo (first test-framework decision —
// see .pHive/CONTEXT.md → Conventions). jsdom by default so individual spec
// files no longer need a per-file `// @vitest-environment jsdom` pragma.
//
// @vitejs/plugin-react handles .tsx -> JS, resolving JSX to React 19's
// automatic runtime (react/jsx-runtime) so component files that don't
// `import React` still compile. Tried leaning on Vite's built-in
// esbuild/oxc transform directly first (no extra dependency), but Vite's
// default transformer honors tsconfig.json's `jsx: "preserve"` (needed by
// Next.js) and left JSX unparsed; the plugin is the standard, documented
// fix and worth the one extra devDependency.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    css: false,
  },
  resolve: {
    alias: {
      // Match tsconfig.json's "@/*": ["./*"] path alias.
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
});
