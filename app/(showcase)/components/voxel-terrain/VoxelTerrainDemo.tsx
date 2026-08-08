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
// Sample data: public/minecraft-samples/2806-prado/heightmap.json —
// already-confirmed public-safe derived terrain (see this story's yaml and
// app/dev-preview-voxel's precedent), not raw property photogrammetry.
import sampleGrid from "@/public/minecraft-samples/2806-prado/heightmap.json";
import type { VoxelGrid } from "@/lib/voxel-types";
import { VoxelStructure, VoxelTerrain } from "@/components/VoxelTerrain";

const grid = sampleGrid as VoxelGrid;

// Centered on the 32x32 sample grid (size/2) — a reasonable, unremarkable
// placement well within bounds regardless of the grid's actual size.
const STRUCTURE_GRID_X = 16;
const STRUCTURE_GRID_Z = 16;

export default function VoxelTerrainDemo() {
  return (
    <VoxelTerrain grid={grid} className="h-full w-full">
      <VoxelStructure grid={grid} gridX={STRUCTURE_GRID_X} gridZ={STRUCTURE_GRID_Z} />
    </VoxelTerrain>
  );
}
