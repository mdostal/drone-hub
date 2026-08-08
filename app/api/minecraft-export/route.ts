// Serves a real, downloadable Sponge Schematic (.schem) file for a sample
// voxel terrain — GET /api/minecraft-export?slug=<slug>. See
// .pHive/epics/minecraft-export/stories/minecraft-export-api-route.yaml.
//
// Server-side only: buildSchematic() (lib/minecraft-schematic.ts) pulls in
// prismarine-nbt + node:zlib, neither of which belong in the client bundle.
// A Route Handler (not a Server Component) is the right shape here — the
// response IS the artifact (a binary file with download headers), not HTML.
//
// Intentionally NOT gated by middleware.ts: the only data this route can
// ever serve is whatever already lives under public/minecraft-samples/**,
// which is already public (the /components/voxel-terrain showcase page
// imports the same JSON directly). Re-deriving a schematic from public JSON
// exposes nothing gating that JSON wouldn't already fail to protect — see
// this story's yaml and the model3d epic's identical public-sample-data
// reasoning. Do NOT add this path to lib/gate.ts's GATED_PATH_PREFIXES or
// middleware.ts's matcher.
import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { SAFE_SLUG_PATTERN } from "@/lib/content-engine-resolution";
import { buildSchematic, type StructurePlacement } from "@/lib/minecraft-schematic";
import type { VoxelGrid } from "@/lib/voxel-types";

/** The sample terrain every showcase/content-engine page already defaults
 *  to (VoxelTerrainDemo.tsx, EnginePageClient, etc.) — also this route's
 *  fallback whenever a requested slug is invalid or has no sample data of
 *  its own yet. */
const DEFAULT_SLUG = "2806-prado";

/** Same house placement VoxelTerrainDemo.tsx uses: centered on the 32x32
 *  sample grid (size/2), a reasonable, unremarkable footprint well within
 *  bounds regardless of the grid's actual size. Width/depth/wallHeight are
 *  intentionally omitted here too, for the same reason — houseCells'
 *  defaults (voxel-geometry.ts) are what the showcase page's rendering
 *  already matches, so reusing them (rather than re-specifying the same
 *  numbers redundantly) is what keeps this export visually consistent with
 *  what the 3D viewer shows. */
const STRUCTURE_PLACEMENT: StructurePlacement = {
  gridX: 16,
  gridZ: 16,
};

function samplesDir(): string {
  return path.join(process.cwd(), "public", "minecraft-samples");
}

/** Resolves the slug param to a safe, on-disk sample directory name: an
 *  invalid slug (fails SAFE_SLUG_PATTERN) or one with no heightmap.json of
 *  its own falls back to DEFAULT_SLUG, mirroring
 *  lib/content-engine-resolution.ts's real-vs-fallback precedent (simpler
 *  here since there's only one real sample today, but the same shape:
 *  never trust the requested slug past the safety check, and never let a
 *  missing per-slug file 404 the whole endpoint). */
function resolveSampleSlug(requestedSlug: string | null): string {
  const slug = requestedSlug ?? DEFAULT_SLUG;
  if (!SAFE_SLUG_PATTERN.test(slug)) return DEFAULT_SLUG;

  const heightmapPath = path.join(samplesDir(), slug, "heightmap.json");
  if (!fs.existsSync(heightmapPath)) return DEFAULT_SLUG;

  return slug;
}

function loadVoxelGrid(slug: string): VoxelGrid {
  const heightmapPath = path.join(samplesDir(), slug, "heightmap.json");
  const raw = fs.readFileSync(heightmapPath, "utf-8");
  return JSON.parse(raw) as VoxelGrid;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestedSlug = request.nextUrl.searchParams.get("slug");
  const slug = resolveSampleSlug(requestedSlug);

  const grid = loadVoxelGrid(slug);
  const schematic = buildSchematic(grid, STRUCTURE_PLACEMENT);

  return new NextResponse(new Uint8Array(schematic), {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${slug}.schem"`,
    },
  });
}
