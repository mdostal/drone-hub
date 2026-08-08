"use client";

// The actual viewer composition, kept as a plain (non-next/dynamic) client
// component so <VoxelStructure> composes into <VoxelTerrain>'s children as
// an ordinary regular import — nesting two SEPARATE next/dynamic
// boundaries across the r3f <Canvas> tree (parent dynamically loaded,
// child also dynamically loaded, child rendered as the parent's `children`
// prop) is unnecessary risk for no benefit here. Only THIS whole component
// is loaded via next/dynamic({ ssr: false }) from page.tsx, same
// single-dynamic-boundary-per-viewer convention as every other dev-preview
// route in this repo.
import sampleGrid from "@/public/minecraft-samples/2806-prado/heightmap.json";
import type { VoxelGrid } from "@/lib/voxel-types";
import { VoxelStructure, VoxelTerrain } from "@/components/VoxelTerrain";

const grid = sampleGrid as VoxelGrid;

export default function VoxelPreviewClient() {
  return (
    <VoxelTerrain grid={grid} className="h-screen w-screen">
      <VoxelStructure grid={grid} gridX={16} gridZ={16} />
    </VoxelTerrain>
  );
}
