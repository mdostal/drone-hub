import fs from "node:fs";
import path from "node:path";
import type { FlightLogEntry } from "./flight-log-types";

// The per-slug "real vs fallback" content-engine resolution logic, extracted
// out of app/properties/[slug]/engine/page.tsx (minecraft-test-suite story)
// so it's unit-testable in isolation — same "extract pure/testable logic"
// precedent every prior 3D-component story in this repo has followed (see
// e.g. components/VoxelTerrain/voxel-geometry.ts, split out of
// VoxelTerrain.tsx/VoxelStructure.tsx for the identical reason: a Server
// Component doing a synchronous fs read isn't itself renderable/callable
// from a Vitest+RTL spec, but the plain function it delegates to is).
//
// This is a PURE refactor: page.tsx's behavior is unchanged, just relocated.
// See this epic's design-discussion.md point 5 for why the real-vs-fallback
// distinction exists at all — a gated page must never silently show generic
// sample content with no visible signal that it isn't the real property's
// data.
//
// `baseDir` is an explicit parameter (never hardcoded to
// `public/content-engine` inside this module) purely so the resolution
// logic is testable against a throwaway fixture directory without touching
// the real filesystem/public/ tree — see
// app/properties/[slug]/engine/page.test.tsx. The production caller
// (page.tsx) always passes `path.join(process.cwd(), "public",
// "content-engine")`.

// Only [a-zA-Z0-9_-] slugs are treated as possible "real content" lookups.
// `slug` is attacker/user-influenced (a URL path segment) and gets joined
// into a filesystem path below; without this guard a crafted slug like
// `../../../../etc` could walk `path.join` outside `baseDir`. Rejecting
// non-conforming slugs here is also semantically correct on its own terms,
// not just a security patch: a slug that can't possibly match a real
// property folder name should behave exactly like "no real content exists
// for this slug" — i.e. fall back to the sample data — rather than erroring.
export const SAFE_SLUG_PATTERN = /^[a-zA-Z0-9_-]+$/;

// The generic fallback dataset (built by minecraft-content-engine-data),
// used whenever a slug has no real <baseDir>/<slug>/ files yet.
export const SAMPLE_SLUG = "sample-house";

export interface ContentEngineFiles {
  engineeringMarkdown: string;
  flightLog: FlightLogEntry[];
}

export interface ContentEngineResolution {
  /** True when `slug` had no real data and the sample-house fallback was
   *  used instead — drives EnginePageClient's visible fallback banner. */
  isFallback: boolean;
  /** The resolved data (real if present, else the sample-house fallback),
   *  or null if even the fallback dataset is missing on disk (a
   *  build/deploy problem, not a per-slug 404 — see page.tsx's throw). */
  content: ContentEngineFiles | null;
}

/**
 * Reads `<baseDir>/<slug>/{engineering.md,flight-log.json}` from disk if
 * BOTH files exist; returns null if either is missing (or `slug` fails the
 * safety pattern above), so the caller can fall back.
 */
export function readContentEngineFiles(baseDir: string, slug: string): ContentEngineFiles | null {
  if (!SAFE_SLUG_PATTERN.test(slug)) return null;

  const dir = path.join(baseDir, slug);
  const engineeringPath = path.join(dir, "engineering.md");
  const flightLogPath = path.join(dir, "flight-log.json");

  if (!fs.existsSync(engineeringPath) || !fs.existsSync(flightLogPath)) {
    return null;
  }

  const engineeringMarkdown = fs.readFileSync(engineeringPath, "utf-8");
  const flightLog = JSON.parse(fs.readFileSync(flightLogPath, "utf-8")) as FlightLogEntry[];
  return { engineeringMarkdown, flightLog };
}

/**
 * The actual per-slug real-vs-fallback resolution: try the real slug first,
 * fall back to the generic sample dataset (SAMPLE_SLUG) if either file is
 * missing. `isFallback` is what should drive a visible "showing sample
 * data" banner — this is the exact check design-discussion.md point 5
 * requires (not a hardcoded sample panel shown regardless of slug).
 */
export function resolveContentEngineData(baseDir: string, slug: string): ContentEngineResolution {
  const real = readContentEngineFiles(baseDir, slug);
  const isFallback = real === null;
  const content = real ?? readContentEngineFiles(baseDir, SAMPLE_SLUG);
  return { isFallback, content };
}
