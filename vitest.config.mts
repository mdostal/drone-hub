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
    // land-overlay-test-suite: lib/maplibre-model-layer.placement.test.ts
    // is a REAL-BROWSER Playwright spec (needs actual WebGL — jsdom has
    // none), run separately via `npm run test:e2e` / playwright.config.ts.
    // Excluded here so `npm test` doesn't try to execute it as a vitest
    // spec — it imports "@playwright/test", not vitest's globals, and
    // would either no-op silently or throw depending on how that import
    // resolves under vitest's runner, neither of which is "actually run
    // the e2e checks." Vitest's `exclude` REPLACES (doesn't merge with)
    // its own built-in default list once set explicitly, so that default
    // list is repeated here verbatim (per Vitest's docs) plus the one new
    // pattern, rather than accidentally losing node_modules/dist/etc.
    // exclusion.
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/cypress/**",
      "**/.{idea,git,cache,output,temp}/**",
      "**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*",
      "**/*.placement.test.ts",
    ],
  },
  resolve: {
    alias: {
      // Match tsconfig.json's "@/*": ["./*"] path alias.
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
});
