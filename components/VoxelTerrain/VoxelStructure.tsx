"use client";

import { useMemo } from "react";
import type { VoxelGrid } from "@/lib/voxel-types";
import { buildHouseBlocks } from "./voxel-geometry";
import { VoxelInstances } from "./VoxelTerrain";

/**
 * <VoxelStructure> — a small procedural cube cluster forming a simple house
 * silhouette (hollow-perimeter walls + a stepped-pyramid peaked roof, see
 * voxel-geometry.ts's buildHouseBlocks), placed at a given grid cell on top
 * of a <VoxelTerrain>'s terrain.
 *
 * NOT a standalone component — it's an r3f component with no `<Canvas>` of
 * its own, meant to be rendered as a CHILD of <VoxelTerrain> so it shares
 * that Canvas's WebGL context, camera, and <Bounds> auto-framing:
 * ```tsx
 * <VoxelTerrain grid={grid}>
 *   <VoxelStructure grid={grid} gridX={16} gridZ={16} />
 * </VoxelTerrain>
 * ```
 * Mounting it outside a <VoxelTerrain>/<Canvas> will throw (r3f elements
 * like `<instancedMesh>` only exist inside a Canvas's render tree) — no
 * different from how <Model3D>'s internal GltfScene/LoadingPlaceholder
 * can't render outside its own <Canvas> either.
 *
 * Reuses `VoxelInstances` — the exact same cube-instancing primitive
 * <VoxelTerrain> renders its ground blocks through (see VoxelTerrain.tsx) —
 * so the structure is a second `THREE.InstancedMesh` draw call, not a
 * per-cube mesh fallback.
 *
 * `grid` is required (not just gridX/gridZ) because placement needs to know
 * the terrain's own height at that cell — see buildHouseBlocks/heightAt in
 * voxel-geometry.ts — otherwise there'd be no way to sit the house ON the
 * terrain surface rather than floating above or sinking into it.
 */
export interface VoxelStructureProps {
  /** The SAME grid passed to the enclosing <VoxelTerrain> — used to look up
   *  the terrain height at (gridX, gridZ) so the house rests on top of it. */
  grid: VoxelGrid;
  /** Grid column (0-indexed) the house is centered on. */
  gridX: number;
  /** Grid row (0-indexed) the house is centered on. */
  gridZ: number;
  /** Footprint width in blocks (X axis). Default 5. */
  width?: number;
  /** Footprint depth in blocks (Z axis). Default 5. */
  depth?: number;
  /** Wall height in blocks, before the roof starts. Default 3. */
  wallHeight?: number;
}

export function VoxelStructure({
  grid,
  gridX,
  gridZ,
  width = 5,
  depth = 5,
  wallHeight = 3,
}: VoxelStructureProps) {
  const blocks = useMemo(
    () => buildHouseBlocks(grid, gridX, gridZ, width, depth, wallHeight),
    [grid, gridX, gridZ, width, depth, wallHeight],
  );
  return <VoxelInstances blocks={blocks} />;
}
