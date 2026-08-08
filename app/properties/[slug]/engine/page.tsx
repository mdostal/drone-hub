import fs from "node:fs";
import path from "node:path";
import type { FlightLogEntry } from "@/lib/flight-log-types";
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

// Only [a-zA-Z0-9_-] slugs are treated as possible "real content" lookups.
// `slug` is attacker/user-influenced (a URL path segment) and gets joined
// into a filesystem path below; without this guard a crafted slug like
// `../../../../etc` could walk `path.join` outside `public/content-engine/`.
// Rejecting non-conforming slugs here is also semantically correct on its
// own terms, not just a security patch: a slug that can't possibly match a
// real property folder name should behave exactly like "no real content
// exists for this slug" — i.e. fall back to the sample data — rather than
// erroring.
const SAFE_SLUG_PATTERN = /^[a-zA-Z0-9_-]+$/;

// The generic fallback dataset (built by minecraft-content-engine-data),
// used whenever a slug has no real public/content-engine/<slug>/ files yet.
const SAMPLE_SLUG = "sample-house";

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

interface ContentEngineFiles {
  engineeringMarkdown: string;
  flightLog: FlightLogEntry[];
}

/**
 * Reads public/content-engine/<slug>/{engineering.md,flight-log.json} from
 * disk if BOTH files exist; returns null if either is missing (or `slug`
 * fails the safety pattern above), so the caller can fall back.
 */
function readContentEngineFiles(slug: string): ContentEngineFiles | null {
  if (!SAFE_SLUG_PATTERN.test(slug)) return null;

  const dir = path.join(process.cwd(), "public", "content-engine", slug);
  const engineeringPath = path.join(dir, "engineering.md");
  const flightLogPath = path.join(dir, "flight-log.json");

  if (!fs.existsSync(engineeringPath) || !fs.existsSync(flightLogPath)) {
    return null;
  }

  const engineeringMarkdown = fs.readFileSync(engineeringPath, "utf-8");
  const flightLog = JSON.parse(fs.readFileSync(flightLogPath, "utf-8")) as FlightLogEntry[];
  return { engineeringMarkdown, flightLog };
}

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
  // hardcoded sample panel shown regardless of slug).
  const real = readContentEngineFiles(slug);
  const isFallback = real === null;
  const content = real ?? readContentEngineFiles(SAMPLE_SLUG);

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
