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

  // /components used to be its own 5-entry table-of-contents page
  // (app/(showcase)/components/page.tsx); the landing page epic moved that
  // ToC (extended to all 7 components/tools) to the root page (app/page.tsx)
  // instead, so the two don't drift into two divergent lists. This redirect
  // fires before Next's filesystem router reaches app/(showcase)/components
  // — which is why that page.tsx (and its RTL test) were deleted rather than
  // left in place as a dead, unreachable file. Permanent because this is a
  // structural route consolidation, not conditional/temporary logic. See
  // .pHive/epics/framework-docs-site/docs/design-discussion.md §2.
  async redirects() {
    return [
      {
        source: "/components",
        destination: "/",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
