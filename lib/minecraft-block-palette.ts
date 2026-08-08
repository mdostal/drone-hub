// Maps this codebase's terrain-band/structure-part classification (the
// SHARED classification components/VoxelTerrain/voxel-geometry.ts exports —
// see classifyHeightBand/TerrainBand/StructurePart there) to real Minecraft
// block-state strings, for lib/minecraft-schematic.ts's Sponge Schematic
// writer. This is a pure mapping table with no NBT/binary concerns of its
// own — the schematic writer is the only thing that cares HOW a block-state
// string ends up encoded.
//
// Block choices are deliberately boring: core, version-stable Java Edition
// block IDs that have existed unchanged since well before 1.13's "The
// Flattening" (namespaced IDs, no numeric block/data-value pairs) and are
// exceedingly unlikely to be renamed/removed in a future version bump —
// see design-discussion.md's risk section ("stick to core, version-stable
// blocks ... not anything exotic"). None of these take block-state
// properties (no `[facing=...]`/`[half=...]` suffix needed) — every choice
// below is a single, always-valid block-state string on its own.
//
//   - low band  -> minecraft:grass_block   (matches the renderer's grass
//                  green low-band color, and is the obvious "ground level"
//                  block real Minecraft terrain uses)
//   - mid band  -> minecraft:dirt          (matches the renderer's brown
//                  mid-band color; also just literally what's under grass
//                  in real Minecraft terrain, so a low-band-over-mid-band
//                  column reads exactly like natural ground)
//   - high band -> minecraft:stone         (matches the renderer's grey
//                  high-band color; the plain, most version-stable stone
//                  variant, not e.g. deepslate which is 1.17+ only)
//   - wall      -> minecraft:oak_planks    (matches WALL_COLOR's "sandy
//                  plank walls" comment in voxel-geometry.ts — planks read
//                  as an actual built structure, not terrain)
//   - roof      -> minecraft:red_wool      (matches ROOF_COLOR's "red-brown
//                  roof" comment; wool is a solid, unambiguous, always-
//                  in-the-game block with no state properties to get wrong)
//   - empty     -> minecraft:air           (required: Sponge Schematic is a
//                  DENSE grid, every position from (0,0,0) to
//                  (Width,Height,Length) needs a palette entry, and air is
//                  the correct block-state for "nothing placed here")
import type { StructurePart, TerrainBand } from "@/components/VoxelTerrain/voxel-geometry";

/** The block-state string for an empty (unoccupied) schematic cell. Every
 *  Sponge Schematic is dense, so this is a real, first-class palette entry
 *  — not a sparse/omitted position. */
export const AIR_BLOCK = "minecraft:air";

const TERRAIN_BAND_BLOCKS: Record<TerrainBand, string> = {
  low: "minecraft:grass_block",
  mid: "minecraft:dirt",
  high: "minecraft:stone",
};

const STRUCTURE_PART_BLOCKS: Record<StructurePart, string> = {
  wall: "minecraft:oak_planks",
  roof: "minecraft:red_wool",
};

/** Maps a terrain cell's height band to its Minecraft block-state string. */
export function blockForTerrainBand(band: TerrainBand): string {
  return TERRAIN_BAND_BLOCKS[band];
}

/** Maps a structure cell's part (wall/roof) to its Minecraft block-state
 *  string. */
export function blockForStructurePart(part: StructurePart): string {
  return STRUCTURE_PART_BLOCKS[part];
}
