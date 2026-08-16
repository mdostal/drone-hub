"use client";

// The actual viewer composition, kept as a plain (non-next/dynamic) client
// component so <VoxelStructure> composes into <VoxelTerrain>'s children as
// an ordinary regular import — nesting two SEPARATE next/dynamic boundaries
// across the r3f <Canvas> tree (parent dynamically loaded, child also
// dynamically loaded, child rendered as the parent's `children` prop) is
// unnecessary risk for no benefit here. Only THIS whole component is loaded
// via next/dynamic({ ssr: false }) from page.tsx — same precedent as
// app/dev-preview-voxel/VoxelPreviewClient.tsx (which this mirrors) and the
// single-dynamic-boundary-per-viewer convention used across this repo.
//
// Two real, selectable samples (voxel-terrain-az-lidar-sample story):
//
//   - public/minecraft-samples/2806-prado/heightmap.json — already-confirmed
//     public-safe derived terrain (see this story's yaml and
//     app/dev-preview-voxel's precedent), not raw property photogrammetry.
//     Structure-on-terrain case (Tier 2 of the operator's content-engine
//     spec): a flat-ish DSM-derived grid with a sample <VoxelStructure>
//     resting on top.
//
//   - public/minecraft-samples/az-wilson-mountain/heightmap.json — REAL
//     USGS 3DEP 1/3 arc-second public elevation data (National Elevation
//     Dataset, tile n35w112, https://tnmaccess.nationalmap.gov/api/v1/products,
//     no auth), cropped to a real bbox around Wilson Mountain and Oak Creek
//     Canyon near Sedona, AZ (lat 34.86-34.96, lon -111.80..-111.68) via
//     pipeline/scripts/dem-to-heightmap.py. Real elevation range in that
//     crop is ~1277m (Oak Creek Canyon floor) to ~2147m (Wilson Mountain's
//     upper slopes) — ~870m (~2,850ft) of real relief inside one 64x64
//     grid, quantized across all 8 height bands (verified: every band 1-8
//     is populated, not clustered at one end). This is Tier 1 of the
//     operator's own content-engine spec ("land/acreage/distant properties
//     -> terrain-only voxel... the terrain drama is the pitch, no structure
//     needed") — rendered with NO <VoxelStructure> child, deliberately, to
//     demonstrate the land-only case. This is real public USGS elevation
//     data for a real, named public-lands location near Sedona, AZ — it is
//     NOT tied to any specific client/operator property.
import { useState } from "react";
import pradoGrid from "@/public/minecraft-samples/2806-prado/heightmap.json";
import azWilsonMountainGrid from "@/public/minecraft-samples/az-wilson-mountain/heightmap.json";
import type { VoxelGrid } from "@/lib/voxel-types";
import { VoxelStructure, VoxelTerrain } from "@/components/VoxelTerrain";

interface VoxelSample {
  label: string;
  grid: VoxelGrid;
  /** Whether to render the sample <VoxelStructure> on top of this grid.
   *  Only the Prado sample gets one — the AZ sample is deliberately
   *  terrain-only (Tier 1: "no structure needed; the terrain drama is the
   *  pitch"). */
  hasStructure: boolean;
}

// Centered on a 32x32 grid (size/2) — a reasonable, unremarkable placement
// well within bounds regardless of the grid's actual size.
const STRUCTURE_GRID_X = 16;
const STRUCTURE_GRID_Z = 16;

const SAMPLES: Record<string, VoxelSample> = {
  "2806-prado": {
    label: "2806 Prado — structure on terrain",
    grid: pradoGrid as VoxelGrid,
    hasStructure: true,
  },
  "az-wilson-mountain": {
    label: "Wilson Mountain, Sedona AZ — real USGS 3DEP, land only",
    grid: azWilsonMountainGrid as VoxelGrid,
    hasStructure: false,
  },
};

const SAMPLE_SLUGS = Object.keys(SAMPLES);

export default function VoxelTerrainDemo() {
  const [selectedSlug, setSelectedSlug] = useState<string>(SAMPLE_SLUGS[0]);
  const sample = SAMPLES[selectedSlug];

  return (
    <div className="flex h-full w-full flex-col gap-2">
      <div className="flex flex-wrap gap-2" role="group" aria-label="VoxelTerrain sample">
        {SAMPLE_SLUGS.map((slug) => (
          <button
            key={slug}
            type="button"
            onClick={() => setSelectedSlug(slug)}
            aria-pressed={selectedSlug === slug}
            className={
              "shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium shadow-sm backdrop-blur transition-colors " +
              (selectedSlug === slug
                ? "border-accent bg-accent/10 text-accent"
                : "border-border bg-surface/90 text-foreground hover:border-accent hover:text-accent")
            }
          >
            {SAMPLES[slug].label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        <VoxelTerrain grid={sample.grid} className="h-full w-full">
          {sample.hasStructure && (
            <VoxelStructure grid={sample.grid} gridX={STRUCTURE_GRID_X} gridZ={STRUCTURE_GRID_Z} />
          )}
        </VoxelTerrain>
      </div>
    </div>
  );
}
