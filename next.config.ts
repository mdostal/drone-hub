import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets playwright.config.ts's webServer run its own `next dev` against an
  // isolated build cache (`NEXT_DIST_DIR=.next-e2e`) instead of the default
  // `.next` — multiple concurrent `next dev` processes against the SAME
  // `.next` directory (this repo checkout genuinely had several at once:
  // this story's own manual verification server plus other in-flight
  // agents' dev servers) contend over that directory's cache/manifest
  // files and can hang indefinitely at "✓ Starting..." (observed live
  // during this story's development — confirmed via `sample`, no CPU
  // activity, stuck for minutes). Unset (the default) behaves exactly as
  // before.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
