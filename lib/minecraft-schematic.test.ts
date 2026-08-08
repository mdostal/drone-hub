// Unit specs for lib/minecraft-schematic.ts. Per the story: the VarInt
// encoder and Palette builder are pure functions (no NBT/gzip needed) and
// get thorough isolated coverage here, INCLUDING byte-identical assertions
// against known LEB128 examples. The full hand-verified golden-fixture
// spec-conformance test (exact expected BlockData byte sequence for a
// fully-worked example, checked against the documented spec by hand) is
// deliberately NOT here — that's the separate minecraft-export-test-suite
// story's job (see design-discussion.md's risk section). The buildSchematic
// specs below are the "secondary sanity check" design-discussion.md
// describes: gzip validity + NBT tag presence + Palette/PaletteMax
// correctness on a small hand-traceable grid, using prismarine-nbt itself
// to parse the output back — NOT a byte-for-byte hand-verification.
import { gunzipSync } from "node:zlib";
import nbt from "prismarine-nbt";
import { describe, expect, it } from "vitest";
import type { VoxelGrid } from "./voxel-types";
import {
  buildBlockIdGrid,
  buildPalette,
  buildSchematic,
  DATA_VERSION,
  encodeBlockData,
  encodeVarInt,
  SCHEMATIC_VERSION,
  toSignedSchematicByte,
} from "./minecraft-schematic";

function flatGrid(size: number, heights: number[]): VoxelGrid {
  return { slug: "test", title: "test grid", size, heights };
}

// ---------------------------------------------------------------------------
// VarInt encoding — pure, no NBT/gzip.
// ---------------------------------------------------------------------------
describe("encodeVarInt", () => {
  it("matches known LEB128 examples byte-for-byte", () => {
    expect(encodeVarInt(0)).toEqual([0x00]);
    expect(encodeVarInt(127)).toEqual([0x7f]);
    expect(encodeVarInt(128)).toEqual([0x80, 0x01]);
  });

  it("encodes single-byte values (0-127) with no continuation bit set", () => {
    expect(encodeVarInt(1)).toEqual([0x01]);
    expect(encodeVarInt(64)).toEqual([0x40]);
    expect(encodeVarInt(126)).toEqual([0x7e]);
  });

  it("encodes two-byte values (128-16383) with the continuation bit set on the first byte only", () => {
    expect(encodeVarInt(129)).toEqual([0x81, 0x01]);
    expect(encodeVarInt(255)).toEqual([0xff, 0x01]);
    expect(encodeVarInt(300)).toEqual([0xac, 0x02]);
    expect(encodeVarInt(16383)).toEqual([0xff, 0x7f]);
  });

  it("encodes a three-byte boundary value (16384) correctly", () => {
    expect(encodeVarInt(16384)).toEqual([0x80, 0x80, 0x01]);
  });

  it("every byte except the last has the continuation bit (0x80) set", () => {
    for (const value of [128, 300, 16384, 2097151, 123456789]) {
      const bytes = encodeVarInt(value);
      for (let i = 0; i < bytes.length - 1; i++) {
        expect(bytes[i] & 0x80).toBe(0x80);
      }
      expect(bytes[bytes.length - 1] & 0x80).toBe(0);
    }
  });

  it("every byte's low 7 bits round-trip back to the original value", () => {
    for (const value of [0, 1, 127, 128, 300, 16384, 999999]) {
      const bytes = encodeVarInt(value);
      let decoded = 0;
      let shift = 0;
      for (const byte of bytes) {
        decoded |= (byte & 0x7f) << shift;
        shift += 7;
      }
      expect(decoded).toBe(value);
    }
  });

  it("rejects negative or non-integer input — palette indices are never negative/fractional", () => {
    expect(() => encodeVarInt(-1)).toThrow(RangeError);
    expect(() => encodeVarInt(1.5)).toThrow(RangeError);
  });
});

describe("toSignedSchematicByte", () => {
  it("leaves 0-127 unchanged (already valid Java signed bytes)", () => {
    expect(toSignedSchematicByte(0)).toBe(0);
    expect(toSignedSchematicByte(1)).toBe(1);
    expect(toSignedSchematicByte(127)).toBe(127);
  });

  it("reinterprets 128-255 into the signed -128..-1 range", () => {
    expect(toSignedSchematicByte(128)).toBe(-128);
    expect(toSignedSchematicByte(255)).toBe(-1);
    expect(toSignedSchematicByte(200)).toBe(200 - 256);
  });

  it("is losslessly reversible via & 0xFF (the standard Java unsigned-byte read)", () => {
    for (let b = 0; b <= 255; b++) {
      expect(toSignedSchematicByte(b) & 0xff).toBe(b);
    }
  });
});

// ---------------------------------------------------------------------------
// Palette construction — pure, no NBT/gzip.
// ---------------------------------------------------------------------------
describe("buildPalette", () => {
  it("assigns sequential indices starting at 0, in first-seen order", () => {
    const { indexByBlock, entries } = buildPalette(["minecraft:air", "minecraft:stone", "minecraft:air", "minecraft:dirt"]);
    expect(indexByBlock.get("minecraft:air")).toBe(0);
    expect(indexByBlock.get("minecraft:stone")).toBe(1);
    expect(indexByBlock.get("minecraft:dirt")).toBe(2);
    expect(entries).toEqual(["minecraft:air", "minecraft:stone", "minecraft:dirt"]);
  });

  it("de-duplicates repeated block IDs — palette size is the count of UNIQUE blocks", () => {
    const { entries } = buildPalette(["minecraft:grass_block", "minecraft:grass_block", "minecraft:grass_block"]);
    expect(entries).toHaveLength(1);
  });

  it("entries[index] inverts indexByBlock for every entry", () => {
    const { indexByBlock, entries } = buildPalette(["a", "b", "c", "a", "b"]);
    for (const [block, index] of indexByBlock) {
      expect(entries[index]).toBe(block);
    }
  });

  it("handles an all-air (fully empty) grid as a single-entry palette", () => {
    const { entries } = buildPalette(new Array(8).fill("minecraft:air"));
    expect(entries).toEqual(["minecraft:air"]);
  });

  it("handles an empty input as an empty palette", () => {
    const { entries } = buildPalette([]);
    expect(entries).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Dense block-ID grid assembly + BlockData encoding — pure, no NBT/gzip.
// ---------------------------------------------------------------------------
describe("buildBlockIdGrid", () => {
  it("sizes Width/Length to the grid's own size and Height to the tallest column", () => {
    const grid = flatGrid(2, [1, 2, 3, 4]);
    const { width, height, length } = buildBlockIdGrid(grid);
    expect(width).toBe(2);
    expect(length).toBe(2);
    expect(height).toBe(4);
  });

  it("produces a dense array of exactly width*height*length entries, air-filled by default", () => {
    const grid = flatGrid(2, [1, 0, 0, 0]); // one column of height 1, rest empty
    const { width, height, length, blockIds } = buildBlockIdGrid(grid);
    expect(blockIds).toHaveLength(width * height * length);
    const airCount = blockIds.filter((id) => id === "minecraft:air").length;
    // height=1, so width*length*height total cells, only 1 cell occupied
    expect(airCount).toBe(width * height * length - 1);
  });

  it("floors Height at 1 even for an all-zero-height grid with no structure", () => {
    const grid = flatGrid(2, [0, 0, 0, 0]);
    const { height, blockIds } = buildBlockIdGrid(grid);
    expect(height).toBe(1);
    expect(blockIds.every((id) => id === "minecraft:air")).toBe(true);
  });

  it("throws when a structure's footprint falls outside the grid bounds", () => {
    const grid = flatGrid(4, new Array(16).fill(2));
    expect(() => buildBlockIdGrid(grid, { gridX: 0, gridZ: 0, width: 5, depth: 5, wallHeight: 2 })).toThrow(RangeError);
  });

  it("raises Height to accommodate a structure taller than the terrain", () => {
    const grid = flatGrid(9, new Array(81).fill(1));
    const { height } = buildBlockIdGrid(grid, { gridX: 4, gridZ: 4, width: 3, depth: 3, wallHeight: 2 });
    // terrain max height = 1; walls (2 levels) + at least one roof level
    // above that must push Height above 1.
    expect(height).toBeGreaterThan(1);
  });
});

describe("encodeBlockData", () => {
  it("iterates in Y-outer, Z-middle, X-inner order (per the Sponge spec's x + z*Width + y*Width*Length indexing)", () => {
    // 2x2x2 grid (width=2, height=2, length=2), each cell holding a
    // distinct block so the emitted VarInt sequence directly reveals
    // iteration order.
    const width = 2;
    const height = 2;
    const length = 2;
    const blockIds: string[] = [];
    // Fill in the SAME x + z*width + y*width*length layout buildBlockIdGrid
    // uses, with a unique label per cell.
    for (let y = 0; y < height; y++) {
      for (let z = 0; z < length; z++) {
        for (let x = 0; x < width; x++) {
          blockIds[x + z * width + y * width * length] = `y${y}z${z}x${x}`;
        }
      }
    }
    const { indexByBlock, entries } = buildPalette(blockIds);
    const bytes = encodeBlockData(blockIds, width, height, length, indexByBlock);
    // Every cell here is a single-byte VarInt (palette < 128 entries), so
    // bytes.length === cell count and bytes[i] is literally the palette
    // index of the i-th cell in emission order.
    expect(bytes).toHaveLength(width * height * length);
    const emittedLabelsInOrder = bytes.map((b) => entries[b]);
    expect(emittedLabelsInOrder).toEqual([
      "y0z0x0",
      "y0z0x1",
      "y0z1x0",
      "y0z1x1",
      "y1z0x0",
      "y1z0x1",
      "y1z1x0",
      "y1z1x1",
    ]);
  });

  it("emits exactly one VarInt-encoded entry per dense cell", () => {
    const grid = flatGrid(2, [1, 2, 1, 2]);
    const { width, height, length, blockIds } = buildBlockIdGrid(grid);
    const { indexByBlock, entries } = buildPalette(blockIds);
    // With a small palette every index fits in one byte, so byte count
    // should equal cell count here too.
    expect(entries.length).toBeLessThan(128);
    const bytes = encodeBlockData(blockIds, width, height, length, indexByBlock);
    expect(bytes).toHaveLength(width * height * length);
  });
});

// ---------------------------------------------------------------------------
// buildSchematic — sanity checks (valid gzip, real NBT tags present, Palette
// correctness on a hand-traceable grid). NOT the golden-fixture byte-exact
// spec-conformance test — see this file's header comment.
// ---------------------------------------------------------------------------
describe("buildSchematic", () => {
  it("returns a Buffer that is valid gzip (decompresses without error)", () => {
    const grid = flatGrid(2, [1, 2, 1, 2]);
    const result = buildSchematic(grid);
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(() => gunzipSync(result)).not.toThrow();
  });

  it("decompresses to real NBT containing all required Sponge Schematic v2 tags", async () => {
    const grid = flatGrid(2, [1, 2, 1, 2]);
    const result = buildSchematic(grid);
    const { parsed } = await nbt.parse(result);
    const simplified = nbt.simplify(parsed);
    expect(simplified).toHaveProperty("Version", SCHEMATIC_VERSION);
    expect(simplified).toHaveProperty("DataVersion", DATA_VERSION);
    expect(simplified).toHaveProperty("Width");
    expect(simplified).toHaveProperty("Height");
    expect(simplified).toHaveProperty("Length");
    expect(simplified).toHaveProperty("PaletteMax");
    expect(simplified).toHaveProperty("Palette");
    expect(simplified).toHaveProperty("BlockData");
    expect(simplified).toHaveProperty("Metadata");
    expect(simplified.Metadata).toHaveProperty("Name");
  });

  it("a small 2x2 uniform-height grid produces exactly the expected distinct Palette entries", async () => {
    // size 2, every cell height 1 -> every occupied cell is stackLevel=1,
    // band "low" -> every block is minecraft:grass_block, no air anywhere
    // (Height=1, every column fully occupies its one layer).
    const grid = flatGrid(2, [1, 1, 1, 1]);
    const result = buildSchematic(grid);
    const { parsed } = await nbt.parse(result);
    const simplified = nbt.simplify(parsed);
    expect(Object.keys(simplified.Palette)).toEqual(["minecraft:grass_block"]);
    expect(simplified.PaletteMax).toBe(1);
  });

  it("a 2x2 grid with mixed heights includes minecraft:air for the resulting empty cells", async () => {
    // one column height 2 (grass at y0, still "low" band at y1), rest height 0
    // -> Height=2, so the 3 empty columns each have 2 air cells = 6 air cells,
    // plus 2 occupied grass cells (both stackLevel<=3 => "low" band).
    const grid = flatGrid(2, [2, 0, 0, 0]);
    const result = buildSchematic(grid);
    const { parsed } = await nbt.parse(result);
    const simplified = nbt.simplify(parsed);
    const paletteBlocks = Object.keys(simplified.Palette).sort();
    expect(paletteBlocks).toEqual(["minecraft:air", "minecraft:grass_block"].sort());
    expect(simplified.PaletteMax).toBe(2);
  });

  it("Width/Height/Length reflect the grid's size and tallest column", async () => {
    const grid = flatGrid(3, [1, 2, 3, 1, 2, 3, 1, 2, 3]);
    const result = buildSchematic(grid);
    const { parsed } = await nbt.parse(result);
    const simplified = nbt.simplify(parsed);
    expect(simplified.Width).toBe(3);
    expect(simplified.Length).toBe(3);
    expect(simplified.Height).toBe(3);
  });

  it("includes a structure's blocks (walls/roof) in the Palette when one is provided", async () => {
    const grid = flatGrid(9, new Array(81).fill(2));
    const result = buildSchematic(grid, { gridX: 4, gridZ: 4, width: 3, depth: 3, wallHeight: 2 });
    const { parsed } = await nbt.parse(result);
    const simplified = nbt.simplify(parsed);
    const paletteBlocks = Object.keys(simplified.Palette);
    expect(paletteBlocks).toContain("minecraft:oak_planks");
  });

  it("BlockData length matches the VarInt-encoded byte count for Width*Height*Length cells", async () => {
    const grid = flatGrid(2, [1, 1, 1, 1]); // single distinct block -> palette size 1 -> every VarInt is 1 byte
    const result = buildSchematic(grid);
    const { parsed } = await nbt.parse(result);
    const simplified = nbt.simplify(parsed);
    const cellCount = simplified.Width * simplified.Height * simplified.Length;
    expect(simplified.BlockData).toHaveLength(cellCount);
  });
});
