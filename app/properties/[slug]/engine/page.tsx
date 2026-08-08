import fs from "node:fs";
import path from "node:path";
import { resolveContentEngineData, SAMPLE_SLUG } from "@/lib/content-engine-resolution";
import type { VoxelGrid } from "@/lib/voxel-types";
import { EnginePageClient } from "./EnginePageClient";

// The per-slug "content engine" page — the operator's own framing: "the
// engineering, the minecraft of it, the flight docs." See this epic's
// design-discussion.md point 5 for the full corrected design (grill flagged
// the original draft for showing identical sample content on every
// property's /engine page forever, with no distinction between "no data
// yet" and "generic demo content" — this file is the fix).
//
// SERVER component, not client (unlike the sibling
// app/properties/[slug]/page.tsx and app/tours/[slug]/page.tsx, which are
// both "use client" + useParams purely so `next/dynamic({ssr:false})` is
// legal to call directly in them). This page needs to synchronously check
// whether real per-slug files exist under public/content-engine/<slug>/ and
// read their contents — that's a Node `fs` operation, only legal in a
// Server Component (or a Route Handler/Server Action), never in a Client
// Component. A client-side fetch-and-check-404 alternative was considered
// (the story text explicitly allows it) and rejected: these are local files
// already on the server filesystem at request time, so a server-side
// existsSync/readFileSync is simpler, avoids an extra network round trip
// and a loading-state flash, and is more directly testable than parsing
// fetch() response statuses. `ssr:false` is still required for <VoxelTerrain>
// (a WebGL viewer) — see EnginePageClient.tsx, which is the "use client"
// boundary that calls next/dynamic, exactly the split Next's App Router
// requires (`ssr:false` is rejected on next/dynamic calls made directly
// inside a Server Component).
//
// Gating for the whole /properties/* tree (this nested route included) is
// enforced server-side by middleware.ts's existing `/properties/:path*`
// matcher before this page is ever reached — see middleware.ts and
// lib/gate.ts. This file intentionally contains zero passcode/session logic
// of its own, per this story's explicit "do NOT modify middleware.ts /
// lib/gate.ts" instruction.

// The actual per-slug real-vs-fallback resolution (which slug's files exist,
// which one to fall back to, the path-traversal safety guard) lives in
// lib/content-engine-resolution.ts — extracted out of this file
// (minecraft-test-suite story) so it's unit-testable in isolation without a
// Server Component render; see that module's header comment and
// page.test.tsx. `SAMPLE_SLUG` ("sample-house") is re-exported from there so
// this file has a single source of truth for it rather than a second literal.

// The shared sample terrain (see this epic's design-discussion.md point 5):
// deliberately NOT resolved per-slug the way engineering.md/flight-log.json
// are — real per-property DSM/heightmap data doesn't exist yet for ANY
// slug, so there's no "real vs fallback" distinction to make here yet, and
// no fallback-banner logic is needed for it. This is the SAME sample
// terrain the public `/components/voxel-terrain` showcase page uses (a
// separate, concurrently-built story), reused here rather than duplicated.
// Once real per-property WebODM/DSM output exists, this constant is where
// that same public/content-engine/<slug>/-style resolution pattern should
// be applied to terrain too — tracked as a known future concern, not this
// story's scope.
const TERRAIN_SAMPLE_SLUG = "2806-prado";

// Where readContentEngineFiles/resolveContentEngineData look for per-slug
// (and the sample-house fallback's) engineering.md/flight-log.json — the
// production `baseDir` argument for lib/content-engine-resolution.ts's
// injectable-base-dir signature (see that module's header comment for why
// it's a parameter rather than hardcoded there: unit tests pass a throwaway
// fixture dir instead).
const CONTENT_ENGINE_BASE_DIR = path.join(process.cwd(), "public", "content-engine");

function readTerrainGrid(): VoxelGrid {
  const gridPath = path.join(
    process.cwd(),
    "public",
    "minecraft-samples",
    TERRAIN_SAMPLE_SLUG,
    "heightmap.json",
  );
  return JSON.parse(fs.readFileSync(gridPath, "utf-8")) as VoxelGrid;
}

export default async function PropertyEnginePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // The actual per-slug real-vs-fallback resolution: try the real slug
  // first, fall back to the generic sample dataset if either file is
  // missing. `isFallback` is what drives EnginePageClient's visible banner
  // — this is the exact check design-discussion.md point 5 requires (not a
  // hardcoded sample panel shown regardless of slug). See
  // lib/content-engine-resolution.ts for the implementation and
  // page.test.tsx for the regression coverage proving both directions work.
  const { isFallback, content } = resolveContentEngineData(CONTENT_ENGINE_BASE_DIR, slug);

  if (!content) {
    // Only reachable if the sample-house fallback data itself is missing —
    // that's a build/deploy problem (minecraft-content-engine-data's
    // output should always be present), not a per-slug 404, so this throws
    // rather than silently rendering an empty page.
    throw new Error(
      `Missing fallback content-engine data at public/content-engine/${SAMPLE_SLUG}/ ` +
        `(expected engineering.md + flight-log.json) — this should always exist.`,
    );
  }

  const grid = readTerrainGrid();

  return (
    <EnginePageClient
      slug={slug}
      isFallback={isFallback}
      engineeringMarkdown={content.engineeringMarkdown}
      flightLog={content.flightLog}
      grid={grid}
    />
  );
}
