import { defineConfig, devices } from "@playwright/test";

// Real-browser/real-WebGL end-to-end config — deliberately SEPARATE from
// vitest.config.mts (npm test). land-overlay-test-suite's numeric placement
// checks (lib/maplibre-model-layer.placement.test.ts) need an actual GPU
// (well, ANGLE/SwiftShader) context: jsdom (vitest's environment) has no
// WebGL at all — see maplibre-model-layer.ts's own "TESTABILITY MAP" header
// comment — so these specs cannot run under vitest. `testMatch` below picks
// up ONLY the `*.placement.test.ts` naming (not the ordinary `*.test.ts`
// vitest specs living right next to it in lib/), and vitest.config.mts's
// `exclude` list has the mirror-image rule, so the two runners never fight
// over the same file. Run via `npm run test:e2e`.
export default defineConfig({
  testDir: ".",
  testMatch: "**/*.placement.test.ts",
  fullyParallel: false, // one shared dev server + real GL context; keep it simple/deterministic
  retries: 0,
  reporter: [["list"]],
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:3948",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Runs the app in DEV mode (not `next build && next start`) on purpose:
  // the test-only `window.__layerViewerHandle` hook (added to
  // app/(showcase)/components/land-overlay/page.tsx and
  // app/(showcase)/components/layer-viewer/page.tsx — see those files' own
  // comments) is gated on `process.env.NODE_ENV !== "production"`, which is
  // only true under `next dev`. Fixed port 3948 (not the default 3000, and
  // not next.js's own auto-increment-on-conflict behavior) so this config
  // doesn't silently start probing other ports if something else on the
  // machine already holds 3000 — `baseURL` above has to match exactly.
  webServer: {
    // NEXT_DIST_DIR isolates this server's build cache from any OTHER
    // `next dev` running against this same checkout (see next.config.ts's
    // own comment — real, observed contention/hangs otherwise).
    command: "npx next dev -p 3948",
    env: { NEXT_DIST_DIR: ".next-e2e" },
    url: "http://localhost:3948",
    reuseExistingServer: !process.env.CI,
    timeout: 90_000,
  },
});
