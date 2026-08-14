import type { NextConfig } from "next";

/**
 * Mounted at tools.mdostal.com/framework via a multi-zone rewrite in the
 * mdostal-tools-hub repo (see that repo's src/lib/tools.ts + next.config.ts).
 * basePath makes every internal link/redirect and /_next/* asset request
 * this app emits already carry the /framework prefix, so the hub's rewrite
 * (which forwards that same prefixed path straight through) just works —
 * Vercel's own documented mechanism for this exact multi-zone setup, and
 * the identical pattern mapstack-us and allergy-locator already use for
 * their own tools.mdostal.com mounts.
 *
 * E2E_NO_BASE_PATH (set only by playwright.config.ts's webServer) disables
 * basePath for the local E2E test server — every existing Playwright spec
 * navigates with a LEADING slash (page.goto("/...")), which per the WHATWG
 * URL spec resolves against the origin only and discards baseURL's own path
 * segment, so a basePath'd server would 404 on every one of those calls.
 */
const BASE_PATH = process.env.E2E_NO_BASE_PATH ? "" : "/framework";

const nextConfig: NextConfig = {
  basePath: BASE_PATH || undefined,
  // Next's automatic basePath prefixing covers <Link>/<Image>/router
  // navigation only — it does NOT cover client code that constructs a fetch
  // URL or a raw <a>/<img> src as a plain string (e.g. a manifest="/..."
  // prop, or a sample glTF model's url field). Those call sites use
  // lib/base-path.ts's withBasePath() helper, which reads this inlined
  // build-time constant — same NEXT_PUBLIC_BASE_PATH pattern mapstack-us
  // uses for its own multi-zone mount.
  env: {
    NEXT_PUBLIC_BASE_PATH: BASE_PATH,
  },

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
      // Standalone deploys (drone-hub-rust.vercel.app) are visited directly,
      // not only through the tools.mdostal.com/framework rewrite — but
      // basePath means Next registers NOTHING at un-prefixed paths, so a
      // direct visit to those paths 404s at the platform level before this
      // app ever renders (confirmed live: bare "/" and bare "/docs" both
      // 404, "/framework" and "/framework/docs" both 200). `basePath: false`
      // matches the UN-prefixed source specifically so these fire for a
      // direct hit; under the tools-hub mount the request already arrives
      // pre-prefixed with /framework and never matches these rules. Only
      // needed when BASE_PATH is actually set — the E2E server has no
      // basePath, and these bare paths there ARE the real app routes every
      // existing Playwright spec navigates to.
      //
      // Deliberately an explicit, known list (not a `/:path*` wildcard) —
      // a wildcard `basePath: false` rule matches the RAW incoming path,
      // which would also match already-correct `/framework/...` requests
      // (Next's automatic basePath-stripping doesn't apply to
      // `basePath: false` rules) and double-prefix them into a broken
      // `/framework/framework/...` redirect. Add a new entry here only for
      // a path that's actually linked bare from somewhere (e.g. an external
      // site) and confirmed broken — not preemptively for every route.
      ...(BASE_PATH
        ? [
            {
              source: "/",
              destination: BASE_PATH,
              basePath: false as const,
              permanent: false,
            },
            {
              source: "/docs",
              destination: `${BASE_PATH}/docs`,
              basePath: false as const,
              permanent: false,
            },
          ]
        : []),
    ];
  },
};

export default nextConfig;
