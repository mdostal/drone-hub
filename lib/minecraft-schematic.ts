// The real Sponge Schematic (.schem) writer — minecraft-export epic. Turns
// a VoxelGrid (+ optional house structure), same shapes
// components/VoxelTerrain/voxel-geometry.ts already computes for the
// three.js renderer, into a real, gzip-compressed, NBT-encoded binary file
// WorldEdit's `//schem load`/Litematica can actually load. NOT a "looks
// like Minecraft" export — see design-discussion.md section 1.
//
// Format: Sponge Schematic v2 (not v3). v2 is the format WorldEdit has
// supported the longest and the one most third-party tools/older WorldEdit
// builds still read; this writer only needs the baseline v2 tag set
// (Version/DataVersion/Width/Height/Length/PaletteMax/Palette/BlockData/
// Metadata) with none of v3's additional features (its own Palette
// sub-compound nesting under `Schematic.Blocks`, biome palette, etc.), so
// there's no reason to take on v3's slightly more complex nesting for
// capability this exporter doesn't use.
//
// DataVersion research: DataVersion 3465 corresponds to Minecraft Java
// Edition 1.20.1 — confirmed against the Minecraft Wiki's per-version
// infobox at https://minecraft.wiki/w/Java_Edition_1.20.1 ("Data version:
// 3465"), fetched during this story's research step. 1.20.1 was picked as
// "a specific, well-known stable Java Edition release" per the story's
// research requirement — a widely-used, non-snapshot, hotfix-stable
// release (not a snapshot/pre-release DataVersion, which can be revised).
//
// BlockData iteration order: confirmed against the Sponge Schematic
// Specification (SpongePowered/Schematic-Specification, versions/
// schematic-2.md) during research — block entries are indexed by
// `x + z * Width + y * Width * Length`, i.e. Y is the OUTERMOST loop, then
// Z, then X innermost (X increments fastest). encodeBlockData below iterates
// explicitly in that exact y/z/x nesting so the order is auditable at a
// glance, rather than relying on an equivalent-but-less-obvious flat-array
// fill order.
//
// VarInt: the same LEB128-style variable-length integer encoding Minecraft's
// own network protocol and the Sponge spec both use — 7 payload bits per
// byte, continuation bit (0x80) set on every byte except the last.
//
// prismarine-nbt is used to build the actual NBT compound tag tree and
// serialize it (see buildSchematic below) — this file does not hand-roll
// any NBT binary encoding. Node's zlib gzips the serialized bytes
// (prismarine-nbt's own `parse()` auto-decompresses gzip on read, but
// `writeUncompressed()` — the write-side function this file calls — does
// exactly what its name says: it does not gzip, so that's this file's job).
import { gzipSync } from "node:zlib";
import nbt, { type Int, type NBT } from "prismarine-nbt";
import {
  houseCells,
  terrainCells,
  type StructureCell,
  type StructurePart,
  type TerrainCell,
} from "@/components/VoxelTerrain/voxel-geometry";
import { AIR_BLOCK, blockForStructurePart, blockForTerrainBand } from "./minecraft-block-palette";
import type { VoxelGrid } from "./voxel-types";

/** Sponge Schematic format version this writer targets. See this file's
 *  header comment for why v2 (not v3). */
export const SCHEMATIC_VERSION = 2;

/** Minecraft Java Edition 1.20.1's DataVersion — see this file's header
 *  comment for the source/confirmation. */
export const DATA_VERSION = 3465;

/** Optional house-structure placement, forwarded straight to
 *  voxel-geometry.ts's houseCells (same parameters, same defaults). */
export interface StructurePlacement {
  gridX: number;
  gridZ: number;
  width?: number;
  depth?: number;
  wallHeight?: number;
}

// ---------------------------------------------------------------------------
// VarInt encoding — pure, no NBT/gzip involved, unit-tested in isolation
// against known LEB128 examples (see minecraft-schematic.test.ts).
// ---------------------------------------------------------------------------

/**
 * Encodes a single non-negative integer as a standard LEB128-style VarInt:
 * 7 payload bits per output byte, continuation bit (0x80) set on every byte
 * except the last. Returns the byte sequence as plain numbers (0-255,
 * UNSIGNED) — {@link toSignedSchematicByte} converts to Java's signed byte
 * range immediately before these go into the NBT ByteArray tag.
 *
 * Known examples (also the unit tests): 0 -> [0x00], 127 -> [0x7F],
 * 128 -> [0x80, 0x01].
 */
export function encodeVarInt(value: number): number[] {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`encodeVarInt expects a non-negative integer palette index, got ${value}`);
  }
  const bytes: number[] = [];
  let remaining = value;
  do {
    let byte = remaining & 0x7f;
    remaining >>>= 7;
    if (remaining !== 0) byte |= 0x80;
    bytes.push(byte);
  } while (remaining !== 0);
  return bytes;
}

/** Reinterprets an unsigned byte (0-255, what {@link encodeVarInt} produces)
 *  as Java's signed byte range (-128..127) — required because NBT's
 *  ByteArray tag stores signed bytes (prismarine-nbt writes each entry via
 *  Node's `Buffer.writeInt8`, which throws for any value >= 128). A real
 *  Sponge Schematic reader reverses this with `& 0xFF` to recover the
 *  original unsigned VarInt byte, so this is a lossless, standard
 *  round-trip, not a data-narrowing hack. */
export function toSignedSchematicByte(unsignedByte: number): number {
  return unsignedByte >= 128 ? unsignedByte - 256 : unsignedByte;
}

// ---------------------------------------------------------------------------
// Palette construction — pure, no NBT/gzip involved, unit-tested in
// isolation (see minecraft-schematic.test.ts).
// ---------------------------------------------------------------------------

export interface SchematicPalette {
  /** block-state string -> its palette index, in first-seen order starting
   *  at 0. */
  indexByBlock: Map<string, number>;
  /** palette index -> block-state string (the inverse of indexByBlock),
   *  i.e. `entries[i]` is the block whose palette index is `i`. */
  entries: string[];
}

/**
 * Builds a Palette from a dense array of block-state strings (one entry per
 * schematic cell, `minecraft:air` included for empty cells — see this
 * file's header comment): each UNIQUE block-state string gets the next
 * sequential integer index, starting at 0, in first-seen order.
 */
export function buildPalette(blockIds: readonly string[]): SchematicPalette {
  const indexByBlock = new Map<string, number>();
  const entries: string[] = [];
  for (const id of blockIds) {
    if (!indexByBlock.has(id)) {
      indexByBlock.set(id, entries.length);
      entries.push(id);
    }
  }
  return { indexByBlock, entries };
}

// ---------------------------------------------------------------------------
// Dense block-ID grid assembly — combines terrainCells + (optional)
// houseCells's raw integer coordinates (voxel-geometry.ts) into one flat,
// zero-origin, non-negative-integer-indexed array. This is the ONLY place
// export coordinates are consumed — never gridToWorldX/Z, never a fractional
// position (design-discussion.md correction 3b).
// ---------------------------------------------------------------------------

function cellIndex(x: number, y: number, z: number, width: number, length: number): number {
  return x + z * width + y * width * length;
}

/** Computes the dense Width x Height x Length block-ID grid (flat array,
 *  indexed by {@link cellIndex}, initialized to {@link AIR_BLOCK}) for a
 *  VoxelGrid + optional structure. Exported for the test-suite story's
 *  golden-fixture cross-checks; buildSchematic uses it internally too. */
export function buildBlockIdGrid(
  grid: VoxelGrid,
  structure?: StructurePlacement,
): { width: number; height: number; length: number; blockIds: string[] } {
  const width = grid.size;
  const length = grid.size;

  const terrain: TerrainCell[] = terrainCells(grid);
  const structureCells: StructureCell[] = structure
    ? houseCells(grid, structure.gridX, structure.gridZ, structure.width, structure.depth, structure.wallHeight)
    : [];

  // Height = the tallest Y index anything actually occupies (terrain's own
  // max column height, or higher still if a structure's walls/roof reach
  // above it) — NOT a fixed/guessed constant, so a schematic is always
  // exactly as tall as its contents and no taller.
  let height = 0;
  for (const cell of terrain) height = Math.max(height, cell.stackLevel);
  for (const cell of structureCells) {
    // Structure cells are absolute grid coordinates (voxel-geometry.ts's
    // houseCells doc comment): a house placed near a grid edge can still
    // produce a footprint that falls outside this grid's own width/length.
    // Throw loudly rather than silently truncating/wrapping — same
    // "surface the bug, don't render it wrong" convention heightAt already
    // established in voxel-geometry.ts.
    if (cell.col < 0 || cell.col >= width || cell.row < 0 || cell.row >= length) {
      throw new RangeError(
        `structure cell (col=${cell.col}, row=${cell.row}) falls outside the ${width}x${length} grid "${grid.slug}" — reposition the structure closer to the grid's center or choose a smaller footprint`,
      );
    }
    height = Math.max(height, cell.stackLevel);
  }
  // A schematic needs at least one Y layer even for an all-zero-height grid
  // with no structure — Width/Height/Length are all NBT Short tags the
  // Sponge spec requires as positive dimensions, so this is a floor, not a
  // guess: the resulting schematic is one layer of solid air.
  if (height < 1) height = 1;

  const blockIds = new Array<string>(width * height * length).fill(AIR_BLOCK);

  for (const cell of terrain) {
    const y = cell.stackLevel - 1; // stackLevel is 1-based; Sponge's Y is 0-based
    blockIds[cellIndex(cell.col, y, cell.row, width, length)] = blockForTerrainBand(cell.band);
  }
  for (const cell of structureCells) {
    const y = cell.stackLevel - 1;
    blockIds[cellIndex(cell.col, y, cell.row, width, length)] = blockForStructurePart(cell.part as StructurePart);
  }

  return { width, height, length, blockIds };
}

/**
 * Encodes a dense block-ID grid's BlockData: iterates every cell in the
 * Sponge spec's documented order (Y outermost, then Z, then X innermost —
 * see this file's header comment), VarInt-encoding each cell's palette
 * index into a growing byte buffer. Returns UNSIGNED bytes (0-255);
 * buildSchematic converts to Java's signed byte range immediately before
 * handing them to prismarine-nbt's ByteArray builder.
 */
export function encodeBlockData(
  blockIds: readonly string[],
  width: number,
  height: number,
  length: number,
  indexByBlock: ReadonlyMap<string, number>,
): number[] {
  const bytes: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let z = 0; z < length; z++) {
      for (let x = 0; x < width; x++) {
        const blockId = blockIds[cellIndex(x, y, z, width, length)];
        const paletteIndex = indexByBlock.get(blockId);
        if (paletteIndex === undefined) {
          throw new Error(`block "${blockId}" at (${x}, ${y}, ${z}) has no palette entry — buildPalette was not run over this exact blockIds array`);
        }
        bytes.push(...encodeVarInt(paletteIndex));
      }
    }
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Top-level entry point.
// ---------------------------------------------------------------------------

/**
 * Builds a real Sponge Schematic v2 (.schem) file for a VoxelGrid (+
 * optional house structure) and returns it as a gzip-compressed Buffer,
 * ready to be written to disk or streamed as an HTTP download.
 */
export function buildSchematic(grid: VoxelGrid, structure?: StructurePlacement): Buffer {
  const { width, height, length, blockIds } = buildBlockIdGrid(grid, structure);
  const palette = buildPalette(blockIds);
  const blockDataBytes = encodeBlockData(blockIds, width, height, length, palette.indexByBlock);
  const signedBlockData = blockDataBytes.map(toSignedSchematicByte);

  // Explicitly `Record<string, Int>`, not `Record<string, ReturnType<typeof
  // nbt.int>>`: nbt.int<T extends number|number[]>'s return type, taken
  // from the unapplied generic function itself (no call-site to infer T
  // from), resolves T to its full constraint (number|number[]) rather than
  // the `number` every actual call here passes — Int (imported above) is
  // the concrete single-value tag type this compound actually needs.
  const paletteCompound: Record<string, Int> = {};
  palette.entries.forEach((blockId, index) => {
    paletteCompound[blockId] = nbt.int(index);
  });

  // `nbt.comp<T>(val: T, name?: string)`'s return type declares `name` as
  // OPTIONAL regardless of whether a name string was actually passed at the
  // call site (the signature isn't call-site-narrowed) — but
  // writeUncompressed's `NBT` parameter type requires `name: string`. The
  // cast below is safe specifically because "Schematic" is a literal
  // passed one line above, not inferred: this is a known imprecision in
  // prismarine-nbt's own .d.ts, not a runtime gap.
  const root = nbt.comp(
    {
      Version: nbt.int(SCHEMATIC_VERSION),
      DataVersion: nbt.int(DATA_VERSION),
      Width: nbt.short(width),
      Height: nbt.short(height),
      Length: nbt.short(length),
      PaletteMax: nbt.int(palette.entries.length),
      Palette: nbt.comp(paletteCompound),
      BlockData: nbt.byteArray(signedBlockData),
      Metadata: nbt.comp({ Name: nbt.string(grid.title) }),
    },
    "Schematic",
  ) as NBT;

  const uncompressed = nbt.writeUncompressed(root, "big");
  return gzipSync(uncompressed);
}
