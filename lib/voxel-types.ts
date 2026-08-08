// Typed data shape for the Minecraft-content-engine voxel terrain.
// This is the DATA shape only — a flat, row-major grid of integer block
// heights. Color/material/texture is deliberately NOT here: that's the
// rendering component's concern (a later story), mirroring how
// lib/layer-types.ts keeps LayerDef free of rendering detail too.

/**
 * A square grid of integer block heights, row-major flattened.
 *
 * `heights[row * size + col]` is the block height (small positive integer,
 * e.g. 1-8) at that cell. `heights.length` MUST equal `size * size`.
 *
 * @example a real sample derived from the 2806-prado hillshade COG
 * ```ts
 * const sample: VoxelGrid = {
 *   slug: "2806-prado",
 *   title: "2806 Prado (derived sample terrain)",
 *   size: 32,
 *   heights: [1, 2, 3, "...", 1024], // abbreviated; real array has size*size numbers
 * };
 * ```
 */
export interface VoxelGrid {
  /** stable slug identifying the source property, e.g. "2806-prado" */
  slug: string;
  /** human-readable title */
  title: string;
  /** grid is size x size cells */
  size: number;
  /** flat row-major array of integer block heights; length === size*size */
  heights: number[];
}
