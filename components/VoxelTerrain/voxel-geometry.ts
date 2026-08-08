// Pure, WebGL-independent geometry/coloring logic for the voxel terrain
// family — deliberately split out of VoxelTerrain.tsx/VoxelStructure.tsx
// (both 'use client' r3f components that need a real Canvas/WebGL context
// to render, same reason Model3D.tsx's rendering JSX can't be unit-tested,
// see components/Model3D/Model3D.test.tsx's header comment) so the actual
// grid-to-world mapping, height-banding, and block-list construction CAN be
// unit-tested without a browser. VoxelTerrain and VoxelStructure both import
// from here — this is the single source of truth for "where does grid cell
// (col, row) live in world space," which matters because VoxelStructure has
// to land exactly on top of VoxelTerrain's terrain, not floating above or
// sunk into it.
import type { VoxelGrid } from "@/lib/voxel-types";

/** World-space size of one grid cell (x/z) and one stacked block (y). Both
 *  1 world unit — a uniform voxel grid, no separate horizontal/vertical
 *  scale to keep straight. */
export const CELL_SIZE = 1;
export const BLOCK_SIZE = 1;

/** Maps a grid column to a world-space X coordinate, centering the whole
 *  grid on the origin (so drei's <Bounds fit> frames it symmetrically and
 *  OrbitControls' default target of [0,0,0] is already the grid's middle,
 *  not a corner). */
export function gridToWorldX(col: number, size: number): number {
  return (col - (size - 1) / 2) * CELL_SIZE;
}

/** Same centering as {@link gridToWorldX}, for the Z axis (grid rows). */
export function gridToWorldZ(row: number, size: number): number {
  return (row - (size - 1) / 2) * CELL_SIZE;
}

/**
 * Looks up the block height at a grid cell, converting the 2D (gridX,
 * gridZ) coordinate VoxelStructure is placed at into VoxelGrid's flat
 * row-major index (`heights[row * size + col]`, per lib/voxel-types.ts).
 * Throws on an out-of-bounds cell rather than silently clamping or
 * returning undefined — a mis-specified structure position is a bug worth
 * surfacing loudly, not rendering wrong.
 */
export function heightAt(grid: VoxelGrid, gridX: number, gridZ: number): number {
  if (!Number.isInteger(gridX) || !Number.isInteger(gridZ) || gridX < 0 || gridZ < 0 || gridX >= grid.size || gridZ >= grid.size) {
    throw new RangeError(
      `VoxelStructure position (${gridX}, ${gridZ}) is outside the ${grid.size}x${grid.size} grid "${grid.slug}"`,
    );
  }
  return grid.heights[gridZ * grid.size + gridX];
}

/**
 * Fixed 3-band palette keyed by a block's stacked LEVEL (1 = the ground
 * layer, increasing upward) — not the column's total height. This is what
 * gives tall columns a layered grass -> dirt -> stone look (matching real
 * terrain: valleys and low ground read green, peaks read grey) rather than
 * every block in a tall column being uniformly "high band" colored.
 * Deliberately small/fixed, no gradients or per-pixel texture — "original
 * blocky aesthetic," no Minecraft assets per CLAUDE.md/the story's do_not.
 */
export function heightBandColor(level: number): string {
  if (level <= 3) return "#4a8f3c"; // grass green — low bands
  if (level <= 5) return "#8b5e3c"; // dirt brown — mid bands
  return "#8f9296"; // stone grey — high bands
}

/** One instanced cube: world position + fill color. The shape both
 *  buildTerrainBlocks and buildHouseBlocks emit, and what VoxelInstances
 *  (components/VoxelTerrain/VoxelTerrain.tsx) consumes to actually render
 *  via drei's <Instances>/<Instance>. */
export interface VoxelBlockInstance {
  position: [number, number, number];
  color: string;
}

/**
 * Expands a VoxelGrid into a flat list of instanced-cube placements: one
 * cube per (column, row, stacked level) up to that cell's height. For the
 * real 32x32 sample (heights 2-7) this is several thousand entries — the
 * reason instancing is mandatory (see do_not list), not a style choice.
 */
export function buildTerrainBlocks(grid: VoxelGrid): VoxelBlockInstance[] {
  const blocks: VoxelBlockInstance[] = [];
  for (let row = 0; row < grid.size; row++) {
    for (let col = 0; col < grid.size; col++) {
      const height = grid.heights[row * grid.size + col];
      const x = gridToWorldX(col, grid.size);
      const z = gridToWorldZ(row, grid.size);
      for (let level = 1; level <= height; level++) {
        blocks.push({
          position: [x, (level - 0.5) * BLOCK_SIZE, z],
          color: heightBandColor(level),
        });
      }
    }
  }
  return blocks;
}

const WALL_COLOR = "#c9a875"; // sandy plank walls
const ROOF_COLOR = "#8a3b2b"; // red-brown roof

/**
 * Builds a small procedural house silhouette out of the same cube-instance
 * shape buildTerrainBlocks emits: a hollow-perimeter box for walls (width x
 * depth footprint, wallHeight tall) topped with a stepped pyramid roof that
 * narrows one ring per level until it caps at a single apex cube (or as
 * close to one as an even width/depth allows).
 *
 * Positioned by looking up the terrain's OWN height at (gridX, gridZ) via
 * {@link heightAt} and stacking the walls starting at that exact level —
 * this is what guarantees the house sits ON TOP of the terrain at that
 * cell (not floating above it or sunk into it), since it uses the identical
 * gridToWorldX/Z + level-to-Y math VoxelTerrain uses for the ground blocks
 * themselves, rather than an independently-guessed offset.
 */
export function buildHouseBlocks(
  grid: VoxelGrid,
  gridX: number,
  gridZ: number,
  width = 5,
  depth = 5,
  wallHeight = 3,
): VoxelBlockInstance[] {
  const baseHeight = heightAt(grid, gridX, gridZ);
  const originX = gridToWorldX(gridX, grid.size);
  const originZ = gridToWorldZ(gridZ, grid.size);
  const blocks: VoxelBlockInstance[] = [];

  // Walls: hollow perimeter only (not a solid block), width x depth
  // footprint, wallHeight blocks tall, resting directly on the terrain
  // column's own height (levels 1..baseHeight are already terrain).
  for (let lx = 0; lx < width; lx++) {
    for (let lz = 0; lz < depth; lz++) {
      const onPerimeter = lx === 0 || lx === width - 1 || lz === 0 || lz === depth - 1;
      if (!onPerimeter) continue;
      const x = originX + (lx - (width - 1) / 2) * CELL_SIZE;
      const z = originZ + (lz - (depth - 1) / 2) * CELL_SIZE;
      for (let level = 1; level <= wallHeight; level++) {
        blocks.push({
          position: [x, (baseHeight + level - 0.5) * BLOCK_SIZE, z],
          color: WALL_COLOR,
        });
      }
    }
  }

  // Roof: a stepped pyramid — each ring is a full (shrinking) slab, not
  // just its own perimeter, so it reads as a solid peaked roof rather than
  // another hollow box. Shrinks by one cube on each side per level until
  // the footprint can't shrink further.
  const maxRoofLevels = Math.ceil(Math.min(width, depth) / 2);
  for (let level = 0; level < maxRoofLevels; level++) {
    const inset = level;
    const roofWidth = width - inset * 2;
    const roofDepth = depth - inset * 2;
    if (roofWidth <= 0 || roofDepth <= 0) break;
    for (let lx = 0; lx < roofWidth; lx++) {
      for (let lz = 0; lz < roofDepth; lz++) {
        const x = originX + (lx + inset - (width - 1) / 2) * CELL_SIZE;
        const z = originZ + (lz + inset - (depth - 1) / 2) * CELL_SIZE;
        blocks.push({
          position: [x, (baseHeight + wallHeight + level + 0.5) * BLOCK_SIZE, z],
          color: ROOF_COLOR,
        });
      }
    }
  }

  return blocks;
}
