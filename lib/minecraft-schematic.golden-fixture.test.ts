// THE critical verification story for the minecraft-export epic — see
// .pHive/epics/minecraft-export/stories/minecraft-export-test-suite.yaml and
// .pHive/epics/minecraft-export/docs/design-discussion.md section 4 ("Risks").
//
// Why this file exists SEPARATELY from lib/minecraft-schematic.test.ts:
// that file's own header comment says outright that its buildSchematic specs
// are "the secondary sanity check ... NOT a byte-for-byte hand-verification"
// and that the real golden-fixture spec-conformance test is deliberately
// deferred to this story. Read design-discussion.md's correction verbatim:
// a round-trip test that writes with prismarine-nbt and reads back with
// prismarine-nbt is NOT sufficient — it only proves the library is a fixed
// point of its own serialization. It would pass identically whether
// lib/minecraft-schematic.ts understood the Sponge Schematic v2 spec
// correctly, or consistently-but-wrongly (e.g. iterated X-outer/Y-inner
// instead of Y-outer/X-inner — a same-library round-trip can't tell the
// difference because both the write and the read side would apply the same
// wrong order and agree with each other).
//
// So the PRIMARY checks below (describe block 1) are values computed BY HAND
// against the documented Sponge Schematic v2 spec and this codebase's own
// documented terrain/palette rules — worked out by reading
// lib/minecraft-schematic.ts, lib/minecraft-block-palette.ts, and
// components/VoxelTerrain/voxel-geometry.ts's SOURCE CODE as a spec to trace
// through on paper, WITHOUT ever calling buildSchematic() first and copying
// its output. Only after the expected values below were fixed in these
// comments was buildSchematic() actually invoked, to compare its real
// decompressed/parsed NBT output against them. If you are tempted to
// "simplify" this file by deleting the derivation comments and just keeping
// the assertions: don't — the comments ARE the verification; without them
// this is just another round-trip test.
//
// Full in-game verification (actually loading this .schem file in a real
// Minecraft Java Edition client via WorldEdit's `//schem load` or
// Litematica) was NOT possible in this environment — there is no Minecraft
// client available here. This is the same limitation design-discussion.md's
// risk section calls out explicitly ("Spec correctness is unverifiable
// in-game in this environment"), and the same honesty precedent as
// land-overlay's numeric-placement story: documented as a known gap, not
// silently glossed over. Everything below is the strongest verification
// achievable without a real client: independent hand-derivation against the
// written spec, checked against the actual binary output.
import { gunzipSync } from "node:zlib";
import nbt from "prismarine-nbt";
import { describe, expect, it } from "vitest";
import type { VoxelGrid } from "./voxel-types";
import { buildSchematic, DATA_VERSION, SCHEMATIC_VERSION } from "./minecraft-schematic";

function flatGrid(size: number, heights: number[]): VoxelGrid {
  return { slug: "golden-fixture-test", title: "golden fixture test grid", size, heights };
}

// ---------------------------------------------------------------------------
// 1. PRIMARY VERIFICATION — hand-derived golden fixtures.
//
// Both fixtures below are 2x2 VoxelGrids (the smallest size that produces a
// non-degenerate Width x Length grid at all, per lib/voxel-types.ts's
// `size x size` contract). Two fixtures, not one, because the single
// smallest possible grid (Fixture A) happens to land on a palette with only
// ONE entry (see its derivation below) and never emits a non-zero VarInt
// index or an air cell — technically correct but a weak check of BlockData
// encoding. Fixture B is a second, still fully hand-traceable grid chosen
// specifically to exercise a two-entry Palette (a non-zero palette index)
// and air cells in the same BlockData sequence.
// ---------------------------------------------------------------------------
describe("golden fixture A: 2x2 flat grid, heights=[1,1,1,1] (PRIMARY spec-conformance check)", () => {
  // --- Hand derivation (worked out by reading the source as a spec, before
  //     ever calling buildSchematic) ---
  //
  // Grid: size=2, heights=[1,1,1,1] (heights is row-major: heights[row*size+col]
  // per lib/voxel-types.ts's doc comment). Every one of the 4 (row,col) cells
  // has height=1.
  //
  // Step 1 — terrainCells (components/VoxelTerrain/voxel-geometry.ts):
  // iterates row 0..1 outer, col 0..1 inner; for each cell, level runs 1..height.
  // With height=1 everywhere, this emits exactly 4 cells, all stackLevel=1:
  //   (row=0,col=0,level=1) (row=0,col=1,level=1) (row=1,col=0,level=1) (row=1,col=1,level=1)
  // classifyHeightBand(1): level<=3 -> "low" (voxel-geometry.ts line ~67).
  // So all 4 cells are band "low" -> blockForTerrainBand("low") =
  // "minecraft:grass_block" (lib/minecraft-block-palette.ts).
  //
  // Step 2 — buildBlockIdGrid (lib/minecraft-schematic.ts): width=length=2.
  // height = max stackLevel across all terrain cells = 1 (no structure passed,
  // so structureCells=[] and the height>=1 floor is already satisfied).
  // So Width=2, Height=1, Length=2 — dense array size = 2*1*2 = 4, every
  // entry initialized to AIR_BLOCK then overwritten per terrain cell via
  // cellIndex(x,y,z,width,length) = x + z*width + y*width*length:
  //   (col=0,row=0) -> x=0,z=0,y=0 -> index 0
  //   (col=1,row=0) -> x=1,z=0,y=0 -> index 1
  //   (col=0,row=1) -> x=0,z=1,y=0 -> index 2
  //   (col=1,row=1) -> x=1,z=1,y=0 -> index 3
  // All 4 of the array's 4 slots (0,1,2,3) get overwritten with
  // "minecraft:grass_block" -- EVERY cell in this particular grid is
  // occupied, so **air never appears anywhere in this fixture's dense
  // array** (this is the "does air actually appear" question the story
  // asked to work out explicitly, traced through buildBlockIdGrid's actual
  // fill logic above, not assumed).
  //
  // Step 3 — buildPalette: scans the flat blockIds array in order
  // [grass,grass,grass,grass] -> first-seen order gives exactly ONE entry:
  //   Palette = { "minecraft:grass_block": 0 }
  //   PaletteMax = 1
  //
  // Step 4 — encodeBlockData: iterates y (0..0), z (0..1), x (0..1) — 4
  // cells total, in the exact order 0,1,2,3 (which for this width/length
  // happens to equal cellIndex's own linearization). Every cell's palette
  // index is 0 (the only entry) -> encodeVarInt(0) = [0x00] (single byte,
  // value < 128, no continuation bit) for every one of the 4 cells.
  //   Expected BlockData (unsigned) = [0, 0, 0, 0]
  //   toSignedSchematicByte(0) = 0 for all four (0 is already in Java's
  //   signed byte range), so the signed ByteArray NBT stores the same
  //   [0, 0, 0, 0].
  const EXPECTED_WIDTH = 2;
  const EXPECTED_HEIGHT = 1;
  const EXPECTED_LENGTH = 2;
  const EXPECTED_PALETTE = { "minecraft:grass_block": 0 };
  const EXPECTED_PALETTE_MAX = 1;
  const EXPECTED_BLOCK_DATA = [0, 0, 0, 0];

  it("buildSchematic's actual decompressed/parsed NBT output matches the hand-derived values exactly", async () => {
    const grid = flatGrid(2, [1, 1, 1, 1]);
    const compressed = buildSchematic(grid);
    // Decompress and parse for real — this is genuinely exercising gzip +
    // prismarine-nbt's binary NBT reader against buildSchematic's actual
    // output, not re-deriving anything from the writer's own internals.
    const uncompressed = gunzipSync(compressed);
    const { parsed } = await nbt.parse(uncompressed);
    const simplified = nbt.simplify(parsed);

    expect(simplified.Width).toBe(EXPECTED_WIDTH);
    expect(simplified.Height).toBe(EXPECTED_HEIGHT);
    expect(simplified.Length).toBe(EXPECTED_LENGTH);
    expect(simplified.Palette).toEqual(EXPECTED_PALETTE);
    expect(simplified.PaletteMax).toBe(EXPECTED_PALETTE_MAX);
    expect(simplified.BlockData).toEqual(EXPECTED_BLOCK_DATA);
  });
});

describe("golden fixture B: 2x2 grid, heights=[2,0,0,0] (PRIMARY — exercises a 2-entry Palette + non-zero VarInt index)", () => {
  // --- Hand derivation ---
  //
  // Grid: size=2, heights=[2,0,0,0]. Row-major: heights[row*2+col], so only
  // (row=0,col=0) has height=2; the other three cells ((row=0,col=1),
  // (row=1,col=0), (row=1,col=1)) have height=0 (no terrain cells at all).
  //
  // Step 1 — terrainCells: only (row=0,col=0) produces cells, levels 1..2:
  //   (col=0,row=0,level=1) band "low" (level<=3) -> minecraft:grass_block
  //   (col=0,row=0,level=2) band "low" (level<=3) -> minecraft:grass_block
  // (Both levels land in the "low" band since the classifyHeightBand cutoff
  // is level<=3 — this fixture does NOT reach the mid/high bands, that's not
  // its purpose; it's here for the Palette/air/VarInt-index check only.)
  //
  // Step 2 — buildBlockIdGrid: width=length=2, height = max stackLevel = 2
  // (no structure). Dense array size = 2*2*2 = 8, all initialized to
  // "minecraft:air", then overwritten via
  // cellIndex(x,y,z,2,2) = x + z*2 + y*4:
  //   (col=0,row=0,level=1) -> x=0,z=0,y=0 -> index 0 -> grass_block
  //   (col=0,row=0,level=2) -> x=0,z=0,y=1 -> index 4 -> grass_block
  // All other 6 indices (1,2,3,5,6,7) remain "minecraft:air" — this grid DOES
  // contain air, unlike Fixture A, because 3 of its 4 columns have height 0
  // while Height is raised to 2 by the one tall column, leaving empty cells
  // above/beside it.
  // Full flat array (index: block) = 0:grass, 1:air, 2:air, 3:air, 4:grass,
  // 5:air, 6:air, 7:air.
  //
  // Step 3 — buildPalette: first-seen scan of that flat array in index order
  // (0,1,2,...,7): index 0 is grass (first) -> palette index 0; index 1 is
  // air (first) -> palette index 1. Every later grass/air is a repeat.
  //   Palette = { "minecraft:grass_block": 0, "minecraft:air": 1 }
  //   PaletteMax = 2
  //
  // Step 4 — encodeBlockData: iterates y(0..1) outer, z(0..1), x(0..1) inner
  // — 8 cells. For THIS width/length (2x2), the y/z/x nested loop visits
  // cellIndex values in exactly increasing order 0,1,2,...,7 (verified by
  // expanding the loop: y=0,z=0,x=0->0; y=0,z=0,x=1->1; y=0,z=1,x=0->2;
  // y=0,z=1,x=1->3; y=1,z=0,x=0->4; y=1,z=0,x=1->5; y=1,z=1,x=0->6;
  // y=1,z=1,x=1->7), so BlockData emission order equals the flat array's own
  // index order. Substituting each block for its palette index:
  //   [grass(0), air(1), air(1), air(1), grass(0), air(1), air(1), air(1)]
  //   = [0, 1, 1, 1, 0, 1, 1, 1]
  // Every value is 0 or 1, both < 128, so each is a single-byte VarInt equal
  // to the raw index (encodeVarInt(0)=[0x00], encodeVarInt(1)=[0x01]) — no
  // multi-byte VarInts in this fixture either, but it does exercise a
  // non-zero index, which Fixture A alone cannot.
  //   Expected BlockData = [0, 1, 1, 1, 0, 1, 1, 1] (unsigned == signed here,
  //   both values are within Java's signed byte range already).
  const EXPECTED_WIDTH = 2;
  const EXPECTED_HEIGHT = 2;
  const EXPECTED_LENGTH = 2;
  const EXPECTED_PALETTE = { "minecraft:grass_block": 0, "minecraft:air": 1 };
  const EXPECTED_PALETTE_MAX = 2;
  const EXPECTED_BLOCK_DATA = [0, 1, 1, 1, 0, 1, 1, 1];

  it("buildSchematic's actual decompressed/parsed NBT output matches the hand-derived values exactly", async () => {
    const grid = flatGrid(2, [2, 0, 0, 0]);
    const compressed = buildSchematic(grid);
    const uncompressed = gunzipSync(compressed);
    const { parsed } = await nbt.parse(uncompressed);
    const simplified = nbt.simplify(parsed);

    expect(simplified.Width).toBe(EXPECTED_WIDTH);
    expect(simplified.Height).toBe(EXPECTED_HEIGHT);
    expect(simplified.Length).toBe(EXPECTED_LENGTH);
    expect(simplified.Palette).toEqual(EXPECTED_PALETTE);
    expect(simplified.PaletteMax).toBe(EXPECTED_PALETTE_MAX);
    expect(simplified.BlockData).toEqual(EXPECTED_BLOCK_DATA);
  });
});

// ---------------------------------------------------------------------------
// 2. DataVersion cross-reference against a SECOND, independent source.
//
// lib/minecraft-schematic.ts's own header comment sources DataVersion 3465
// (Minecraft Java Edition 1.20.1) from the Minecraft Wiki
// (https://minecraft.wiki/w/Java_Edition_1.20.1, "Data version: 3465").
// That is ONE source. This story requires a genuinely SECOND, independent
// source, not a restatement of the writer's own lookup.
//
// Second source used here: misode/mcmeta
// (https://github.com/misode/mcmeta) — a well-known, widely-used, actively
// maintained open-source repository (maintained by "misode," a
// well-known Minecraft data-pack/technical-tooling author whose Pack.mcmeta
// Generator / Data Pack tools/"Versions Explorer" — https://misode.github.io —
// are standard references in the Minecraft technical community) that
// auto-generates and version-controls Minecraft's own generated data by
// running Mojang's official data generators against every release — i.e. it
// is derived from Mojang's own tooling output, not hand-transcribed from the
// Wiki, making it a genuinely independent cross-check rather than a mirror
// of the same claim.
//
// Verified by fetching the repo's `summary/versions/data.json` branch file
// directly (not asking a search engine to summarize it — the exact JSON
// below was retrieved via `curl` against the raw GitHub content during this
// story's research step):
//
//   curl -s https://raw.githubusercontent.com/misode/mcmeta/summary/versions/data.json
//
// The entry for id "1.20.1" (excerpted):
//   {
//     "id": "1.20.1",
//     "name": "1.20.1",
//     "type": "release",
//     "stable": true,
//     "data_version": 3465,
//     "protocol_version": 763,
//     "data_pack_version": 15,
//     "resource_pack_version": 15,
//     "build_time": "2023-06-12T13:23:26+00:00",
//     "release_time": "2023-06-12T13:25:51+00:00",
//     "sha1": "c2f76c955503c7143424b51e21eea87bbe5c6547"
//   }
//
// `data_version: 3465` for id "1.20.1" — this AGREES with the Minecraft
// Wiki's value the writer story used. Both the release_time
// (2023-06-12) and the well-documented 1.20.1 release date corroborate this
// is genuinely the 1.20.1 entry, not a mismatched adjacent version. No
// discrepancy to resolve: two independent sources, same value.
//
// This value is hardcoded below (not fetched at test-run time) because
// tests must be deterministic and runnable offline/in CI without a network
// dependency — the verification work (the actual cross-source fetch) is
// what happened during this story's research step, documented above for
// audit; the assertion below just pins DATA_VERSION to that confirmed value
// so a future accidental change to DATA_VERSION is caught.
describe("DataVersion cross-reference", () => {
  const SECOND_SOURCE_DATA_VERSION_FOR_1_20_1 = 3465; // misode/mcmeta summary/versions/data.json, id "1.20.1" — see comment block above

  it("DATA_VERSION (3465, sourced from the Minecraft Wiki per minecraft-schematic.ts's header) agrees with the independent misode/mcmeta source for Minecraft 1.20.1", () => {
    expect(DATA_VERSION).toBe(SECOND_SOURCE_DATA_VERSION_FOR_1_20_1);
  });
});

// ---------------------------------------------------------------------------
// 3. SECONDARY sanity check — same-library round-trip.
//
// Per design-discussion.md's correction, this is worth having but is NOT
// the primary verification and must not be read as sufficient on its own:
// writing with prismarine-nbt and reading back with prismarine-nbt only
// proves the library agrees with itself, not that the Sponge Schematic v2
// spec was followed correctly. The hand-derived fixtures in section 1 above
// are what actually check spec conformance; this just guards against
// gross structural regressions (wrong tag types, buildSchematic throwing,
// tags going missing) between buildSchematic and a real NBT reader.
// ---------------------------------------------------------------------------
describe("same-library round-trip (SECONDARY sanity check only — see section 1 above for the primary verification)", () => {
  it("round-trips a grid+structure through buildSchematic -> gunzip -> prismarine-nbt parse with structurally consistent tags", async () => {
    const grid = flatGrid(9, new Array(81).fill(2));
    const compressed = buildSchematic(grid, { gridX: 4, gridZ: 4, width: 3, depth: 3, wallHeight: 2 });
    const uncompressed = gunzipSync(compressed);
    const { parsed } = await nbt.parse(uncompressed);
    const simplified = nbt.simplify(parsed);

    expect(simplified.Version).toBe(SCHEMATIC_VERSION);
    expect(simplified.DataVersion).toBe(DATA_VERSION);
    // Internal self-consistency: PaletteMax must equal the actual number of
    // distinct Palette entries, and BlockData's length must equal
    // Width*Height*Length (one VarInt-index entry per cell, though
    // multi-byte VarInts mean byte count can exceed cell count for large
    // palettes — here the palette is small so it's cell-count-exact).
    expect(Object.keys(simplified.Palette)).toHaveLength(simplified.PaletteMax);
    expect(simplified.BlockData.length).toBeGreaterThanOrEqual(simplified.Width * simplified.Height * simplified.Length);
    expect(simplified.Metadata.Name).toBe(grid.title);
  });
});
