"use client";

import { VoxelStructure, VoxelTerrain } from "@/components/VoxelTerrain";
import type { VoxelGrid } from "@/lib/voxel-types";

// Small composition wrapper so EnginePageClient.tsx only needs ONE
// next/dynamic({ssr:false}) call for the whole voxel scene, rather than two
// separate dynamic imports for <VoxelTerrain> and <VoxelStructure> that
// would then need to be nested correctly at the call site. <VoxelStructure>
// MUST render as a child of <VoxelTerrain> (it's an r3f element with no
// <Canvas> of its own — see VoxelStructure.tsx's header comment), so that
// composition is fixed here, in one place, and the dynamic-imported result
// is a single ready-to-use scene.
//
// This file itself is a plain "use client" component (no dynamic() call
// inside it) — the ssr:false boundary is applied to THIS component as a
// whole from EnginePageClient.tsx, which is sufficient: everything this
// file imports (VoxelTerrain, VoxelStructure, and transitively
// @react-three/fiber/drei) only ever gets evaluated once this component is
// actually loaded, which next/dynamic({ssr:false}) already guarantees
// happens client-side only.
export interface VoxelSceneProps {
  grid: VoxelGrid;
}

// Grid is 32x32 (see public/minecraft-samples/2806-prado/heightmap.json) —
// centered placement for the sample house.
const HOUSE_GRID_X = 16;
const HOUSE_GRID_Z = 16;

export function VoxelScene({ grid }: VoxelSceneProps) {
  return (
    <VoxelTerrain grid={grid}>
      <VoxelStructure grid={grid} gridX={HOUSE_GRID_X} gridZ={HOUSE_GRID_Z} />
    </VoxelTerrain>
  );
}
