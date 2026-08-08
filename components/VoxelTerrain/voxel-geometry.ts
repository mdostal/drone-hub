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
 * The 3-band terrain classification, keyed by a block's stacked LEVEL (1 =
 * the ground layer, increasing upward) — not the column's total height.
 * This is what gives tall columns a layered low -> mid -> high look
 * (matching real terrain: valleys and low ground read as one material,
 * peaks read as another) rather than every block in a tall column being
 * uniformly one band.
 *
 * SHARED classification (minecraft-export epic, design-discussion.md
 * correction 3a): both {@link heightBandColor} (the three.js color mapper
 * below) and lib/minecraft-block-palette.ts's Minecraft-block-ID mapper
 * call this SAME function — the band logic lives in exactly one place, not
 * duplicated between the renderer and the exporter.
 */
export type TerrainBand = "low" | "mid" | "high";

export function classifyHeightBand(level: number): TerrainBand {
  if (level <= 3) return "low";
  if (level <= 5) return "mid";
  return "high";
}

/**
 * Fixed 3-band color palette for the three.js renderer, keyed off
 * {@link classifyHeightBand} — deliberately small/fixed, no gradients or
 * per-pixel texture ("original blocky aesthetic," no Minecraft assets per
 * CLAUDE.md/the story's do_not).
 */
export function heightBandColor(level: number): string {
  const band = classifyHeightBand(level);
  if (band === "low") return "#4a8f3c"; // grass green — low bands
  if (band === "mid") return "#8b5e3c"; // dirt brown — mid bands
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
 * One RAW, zero-origin, non-negative INTEGER terrain cell — `col`/`row` are
 * the grid's own indices (0..size-1, straight out of `heights[row * size +
 * col]`), `stackLevel` is 1..height (1 = the ground layer, same numbering
 * {@link classifyHeightBand} expects). Deliberately NOT a three.js world
 * position: no centering, no `- 0.5` fractional offset, nothing derived
 * from {@link gridToWorldX}/{@link gridToWorldZ}.
 *
 * minecraft-export epic, design-discussion.md correction 3b: Sponge
 * Schematic's own coordinate system IS exactly "dense, zero-origin,
 * non-negative integers" already, so lib/minecraft-schematic.ts consumes
 * these cells directly via {@link terrainCells} — routing export through
 * the centered/fractional world-space transform below would require
 * flooring/rebasing fractional coordinates back to integers, which risks
 * two distinct fractional positions rounding to the same cell and silently
 * overwriting a block (the exact collision risk grill flagged). The
 * renderer ({@link buildTerrainBlocks}) is the ONLY thing that converts
 * these raw cells into centered/fractional positions, and only for display.
 */
export interface TerrainCell {
  col: number;
  row: number;
  stackLevel: number;
  band: TerrainBand;
}

/**
 * Expands a VoxelGrid into its raw, zero-origin integer terrain cells — one
 * per (column, row, stacked level) up to that cell's height. The single
 * source of truth both {@link buildTerrainBlocks} (three.js rendering) and
 * lib/minecraft-schematic.ts (real .schem export) build on top of, so the
 * "which cell has a block, and what band is it" logic is genuinely shared,
 * not duplicated between the renderer and the exporter.
 */
export function terrainCells(grid: VoxelGrid): TerrainCell[] {
  const cells: TerrainCell[] = [];
  for (let row = 0; row < grid.size; row++) {
    for (let col = 0; col < grid.size; col++) {
      const height = grid.heights[row * grid.size + col];
      for (let level = 1; level <= height; level++) {
        cells.push({ col, row, stackLevel: level, band: classifyHeightBand(level) });
      }
    }
  }
  return cells;
}

/**
 * Expands a VoxelGrid into a flat list of instanced-cube placements: one
 * cube per (column, row, stacked level) up to that cell's height. For the
 * real 32x32 sample (heights 2-7) this is several thousand entries — the
 * reason instancing is mandatory (see do_not list), not a style choice.
 *
 * Built on top of {@link terrainCells} (the shared raw-integer-grid
 * source), applying the centered/fractional world-space transform ONLY
 * here, for rendering — see {@link TerrainCell}'s doc comment.
 */
export function buildTerrainBlocks(grid: VoxelGrid): VoxelBlockInstance[] {
  return terrainCells(grid).map((cell) => {
    const x = gridToWorldX(cell.col, grid.size);
    const z = gridToWorldZ(cell.row, grid.size);
    return {
      position: [x, (cell.stackLevel - 0.5) * BLOCK_SIZE, z] as [number, number, number],
      color: heightBandColor(cell.stackLevel),
    };
  });
}

const WALL_COLOR = "#c9a875"; // sandy plank walls
const ROOF_COLOR = "#8a3b2b"; // red-brown roof

/** Which part of the procedural house a {@link StructureCell} belongs to —
 *  the shared classification lib/minecraft-block-palette.ts's structure
 *  mapper keys off of, same pattern as {@link TerrainBand}. */
export type StructurePart = "wall" | "roof";

/**
 * One RAW, zero-origin INTEGER structure cell — same contract as
 * {@link TerrainCell} (see its doc comment for why this exists instead of
 * routing through the centered/fractional world transform). `col`/`row`
 * are ABSOLUTE grid indices (the house's footprint offset already applied
 * relative to `gridX`/`gridZ`, not a further-centered value), `stackLevel`
 * is absolute too (`baseHeight + local level`, 1 = the grid's ground layer
 * — the same numbering {@link TerrainCell} uses), so structure and terrain
 * cells slot into the same dense integer grid with no unit conversion
 * needed at the call site. Guaranteed integer by construction (see
 * {@link houseCells}'s odd-width/depth guard); NOT guaranteed to fall
 * inside any particular grid's bounds (a house placed near a grid edge can
 * still produce negative or overflowing col/row) — lib/minecraft-
 * schematic.ts is responsible for validating cells against its own target
 * dimensions before use, same as {@link heightAt} already validates a
 * house's center point against `grid`.
 */
export interface StructureCell {
  col: number;
  row: number;
  stackLevel: number;
  part: StructurePart;
}

/**
 * The house's SHAPE, in purely local (footprint-relative, 1-indexed
 * level-offset-from-baseHeight) terms — a hollow-perimeter box for walls
 * (width x depth footprint, wallHeight tall) topped with a stepped pyramid
 * roof that narrows one ring per level until it caps at a single apex cube
 * (or as close to one as an even width/depth allows). Internal helper
 * shared by both {@link houseCells} (raw integer grid export) and
 * {@link buildHouseBlocks} (centered/fractional three.js rendering) so the
 * actual wall/roof geometry is defined exactly once — only the local ->
 * global coordinate mapping differs between the two consumers.
 */
interface HouseLocalCell {
  lx: number;
  lz: number;
  /** 1-based level offset above baseHeight — wall levels are 1..wallHeight,
   *  roof levels continue upward from wallHeight+1. */
  levelOffset: number;
  part: StructurePart;
}

function houseLocalCells(width: number, depth: number, wallHeight: number): HouseLocalCell[] {
  const cells: HouseLocalCell[] = [];

  // Walls: hollow perimeter only (not a solid block), width x depth
  // footprint, wallHeight blocks tall, resting directly on the terrain
  // column's own height (levels 1..baseHeight are already terrain).
  for (let lx = 0; lx < width; lx++) {
    for (let lz = 0; lz < depth; lz++) {
      const onPerimeter = lx === 0 || lx === width - 1 || lz === 0 || lz === depth - 1;
      if (!onPerimeter) continue;
      for (let levelOffset = 1; levelOffset <= wallHeight; levelOffset++) {
        cells.push({ lx, lz, levelOffset, part: "wall" });
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
        cells.push({ lx: lx + inset, lz: lz + inset, levelOffset: wallHeight + level + 1, part: "roof" });
      }
    }
  }

  return cells;
}

/**
 * Expands a house placement into its raw, zero-origin integer structure
 * cells — the shared source lib/minecraft-schematic.ts's exporter consumes
 * directly (see {@link StructureCell}'s doc comment). Requires an odd
 * width/depth: an even footprint has no single integer center column/row
 * (the three.js renderer tolerates the resulting half-cell offset since
 * it's just a fractional world position, but the exporter cannot — every
 * cell must land on exactly one integer grid index).
 */
export function houseCells(
  grid: VoxelGrid,
  gridX: number,
  gridZ: number,
  width = 5,
  depth = 5,
  wallHeight = 3,
): StructureCell[] {
  const baseHeight = heightAt(grid, gridX, gridZ);
  const xOffset = (width - 1) / 2;
  const zOffset = (depth - 1) / 2;
  if (!Number.isInteger(xOffset) || !Number.isInteger(zOffset)) {
    throw new RangeError(
      `houseCells requires an odd width/depth for a raw-integer-grid export (got width=${width}, depth=${depth}) — an even footprint has no single integer center column/row`,
    );
  }
  return houseLocalCells(width, depth, wallHeight).map((cell) => ({
    col: gridX + (cell.lx - xOffset),
    row: gridZ + (cell.lz - zOffset),
    stackLevel: baseHeight + cell.levelOffset,
    part: cell.part,
  }));
}

/**
 * Builds a small procedural house silhouette out of the same cube-instance
 * shape buildTerrainBlocks emits, using the SAME shape logic
 * ({@link houseLocalCells}) {@link houseCells} uses for export — only the
 * local -> global coordinate mapping differs (centered/fractional
 * three.js world space here, vs raw integers there).
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
  return houseLocalCells(width, depth, wallHeight).map((cell) => ({
    position: [
      originX + (cell.lx - (width - 1) / 2) * CELL_SIZE,
      (baseHeight + cell.levelOffset - 0.5) * BLOCK_SIZE,
      originZ + (cell.lz - (depth - 1) / 2) * CELL_SIZE,
    ] as [number, number, number],
    color: cell.part === "wall" ? WALL_COLOR : ROOF_COLOR,
  }));
}
