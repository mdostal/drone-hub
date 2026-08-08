# Design Discussion — Real Minecraft world export (.schem download)

## 0. Prelude

**Operator's request (verbatim, opening this scope):** "we need to do a true
minecraft download as well so we can export the webodm or something to
minecraft and we'll have to make a tool."

The `minecraft-content-engine` epic (done, merged to master) built
`<VoxelTerrain>`/`<VoxelStructure>` — a Minecraft-*styled* three.js renderer,
not an actual Minecraft file. This epic is the real thing: a downloadable
file real Minecraft (Java Edition) can actually load.

**Prior decisions directly relevant:** `lib/voxel-types.ts`'s `VoxelGrid`
and `components/VoxelTerrain/voxel-geometry.ts`'s `buildTerrainBlocks`/
`buildHouseBlocks` already compute exactly which grid cell gets which block
at which stacked height — that block-placement logic is the real asset this
epic reuses; only the *output format* changes (three.js instance positions
+ colors → a real Minecraft block palette + NBT-encoded file).

## 1. Goal

Given a `VoxelGrid` (+ optional structure), produce a real, spec-compliant
Minecraft schematic file a player can download and paste into an actual
Minecraft Java Edition world (via WorldEdit's `//schem load` + `//paste`, or
Litematica) — not a demo, not a "looks like Minecraft" renderer.

## 2. Proposed approach

1. **File format: Sponge Schematic Format (`.schem`), not a full world/
   region-file export.** A `.schem` is a single, portable, NBT-encoded,
   gzip-compressed file representing one buildable structure — the standard
   format WorldEdit/Litematica/etc. use for exactly "here's a build,
   download and paste it." A full Minecraft *world* (the Anvil format:
   folders of region `.mca` files, chunk-indexed, far more machinery for
   player spawn points, level.dat, etc.) is a different, much larger scope
   than "download and load a structure into Minecraft" actually requires —
   confirmed this is the right target, not a lesser substitute, because
   every mainstream "export a build to Minecraft" tool (including
   WebODM-adjacent GIS-to-Minecraft projects) uses schematic formats for
   exactly this reason.
2. **`prismarine-nbt` for NBT encoding** — a real, maintained library from
   the PrismarineJS ecosystem (used across many Minecraft bot/tooling
   projects, not a one-off dependency), confirmed reachable on the npm
   registry during planning. Used to build the actual NBT compound tag tree
   (Sponge Schematic v2/v3's `Version`, `DataVersion`, `Width`/`Height`/
   `Length`, `Palette`, `PaletteMax`, `BlockData`, `Metadata` tags) and
   gzip-compress it — this repo does NOT hand-roll an NBT binary encoder.
3. **`lib/minecraft-schematic.ts`** — the core writer:
   `buildSchematic(grid: VoxelGrid, structure?: {gridX, gridZ, ...}):
   Buffer`. **CORRECTED after grill — this has THREE distinct steps, not
   one; the original draft only described the first and hand-waved the
   other two as "reuse the existing math":**

   a. **Block classification** (reused): refactor `voxel-geometry.ts` so
      "which band is this cell/level in, is it part of the structure" is a
      shared, exported classification BOTH the existing three.js color
      mapper and this epic's Minecraft-block-ID mapper call — genuinely
      reused, not duplicated.

   b. **Coordinate system — CORRECTED, not reused as-is.** Grill correctly
      caught that `voxel-geometry.ts`'s `gridToWorldX`/`Z` produce
      *centered, fractional* three.js display coordinates (e.g.
      `col - (size-1)/2`, `level - 0.5`) specifically for rendering — reusing
      those directly for Minecraft would require flooring/rebasing to a
      zero-origin integer grid, and grill correctly flagged that fractional
      positions rounding to the same integer cell could silently collide
      (one block overwriting another) with no test catching it. **Fix: do
      NOT route through the three.js world-space transform at all for
      export.** Use the grid's own raw integer indices directly —
      `x = col`, `y = stackLevel`, `z = row` — which are already exactly
      what Sponge Schematic wants (a dense, zero-origin, non-negative
      integer grid) with no centering and no fractional risk. This requires
      exposing raw `(col, stackLevel, row)` alongside (or instead of) the
      three.js position from the shared block-classification step (3a) —
      the renderer keeps applying its own centering transform for display;
      the exporter never sees fractional coordinates at all.

   c. **BlockData encoding — CORRECTED, previously entirely unaddressed.**
      Grill correctly caught that "maps bands to Minecraft blocks" is NOT
      the encoding step — Sponge v2/v3's `BlockData` tag is specifically:
      build a `Palette` (unique block-state string → integer index,
      starting at 0, `minecraft:air` included for empty cells since the
      grid is dense, not sparse), then iterate every cell in the schematic's
      documented order (Y outer, then Z, then X — i.e. for each Y-layer,
      for each Z-row, for each X-column) emitting that cell's palette index
      as a **VarInt** (standard LEB128-style variable-length integer: 7
      payload bits per byte, high bit set on all but the last byte — the
      same VarInt scheme Minecraft's own network protocol uses), and
      `PaletteMax` = the palette's size. This whole step is real,
      spec-specific work the implementing story must actually build, not
      something block-classification (3a) or coordinate mapping (3b) gets
      for free.

   Maps bands to real Minecraft blocks (e.g. low → `minecraft:grass_block`,
   mid → `minecraft:dirt`, high → `minecraft:stone`; structure walls →
   `minecraft:oak_planks`, roof → `minecraft:red_wool` or similar — exact
   choices left to the implementing story, documented when made).
4. **Server-side only, via a Next.js Route Handler** (`app/api/minecraft-
   export/route.ts`), not a client-bundled export. `prismarine-nbt` +
   Node's `zlib` are server-side APIs; bundling NBT/gzip machinery into the
   client JS for a feature that only ever produces a downloadable file
   would bloat the bundle for zero benefit — the route handler builds the
   file server-side and streams it back with `Content-Disposition:
   attachment`.
5. **UI: a "Download for Minecraft" button** on both the public
   `/components/voxel-terrain` showcase page and the gated `/properties/
   [slug]/engine` content-engine page — hits the API route, triggers a
   browser download. No new page/surface needed; this is an action on
   surfaces that already render the voxel terrain, not a new destination.
6. **Decoupled from data source, same pattern as every prior epic.** The
   exporter's contract is "give me a `VoxelGrid`," not "give me a hillshade
   COG" — it doesn't care whether that grid came from the sample hillshade
   (today) or real WebODM DSM output (later, once Phase-0 data exists, via
   the SAME heightmap-derivation script the minecraft-content-engine epic
   already built). This directly answers "export the webodm or something to
   minecraft" without needing rework once real data exists.

## 3. Scale assessment

**Medium.** One concentrated, genuinely technical risk (getting the Sponge
Schematic NBT structure exactly right — a real binary-format-correctness
problem, similar in kind to land-overlay's matrix-math risk, though lower
severity since a malformed schematic just fails to import rather than
silently rendering wrong), plus a route handler and a UI trigger. H/V slice
planning applies.

## 4. Risks

- **Spec correctness is unverifiable in-game in this environment** — there
  is no Minecraft client available to actually test-load the exported file.

  **CORRECTED after grill: a round-trip test using `prismarine-nbt` for both
  writing AND reading is NOT sufficient verification** — it only proves the
  library is a fixed point of its own serialization, and would pass
  identically whether the Sponge spec was understood correctly or
  consistently-but-wrongly. **Required instead: a hand-verified golden
  fixture.** The implementing test story must hand-construct a tiny (e.g.
  2x2x2 or smaller), fully-worked example — compute the expected `Palette`,
  the expected VarInt-encoded `BlockData` byte sequence, and `PaletteMax`
  BY HAND against the documented spec (not by running the writer and
  trusting its output) — and assert the writer produces byte-identical
  output for that known case. This is the actual spec-conformance check;
  the same-library round-trip is a secondary sanity check on top of it, not
  a replacement for it.
- **`DataVersion` must match a real Minecraft version** or WorldEdit may
  reject/misinterpret the file. **CORRECTED after grill: "needs research"
  had no landing criterion — fixed with an explicit cross-reference
  requirement.** The implementing story must confirm the chosen DataVersion
  against at least TWO independent sources (e.g. the Minecraft Wiki's data
  version table AND an example/reference in the Sponge Schematic format's
  own published spec or a well-known open-source schematic library's test
  fixtures) and they must agree — not a single lookup trusted on its own.
  Document the exact version targeted, the DataVersion integer, and both
  sources checked.
- **Block palette choices affect the file's actual usefulness** (a
  schematic with block IDs that don't exist in the target Minecraft version
  simply won't paste correctly) — stick to core, version-stable blocks
  (grass/dirt/stone/oak_planks/wool), not anything exotic.
- **Route handler must not leak filesystem paths or accept arbitrary slugs
  without validation** — reuse the `SAFE_SLUG_PATTERN` precedent from
  `lib/content-engine-resolution.ts` (land-overlay/minecraft epics already
  established this exact discipline for slug-derived file paths) rather
  than inventing new validation logic.
- **The house structure's roof (`buildHouseBlocks`'s "stepped-pyramid")
  already produces discrete per-level block sets** (it's built from cube
  instances, same as the terrain — there's no continuous/smooth geometry to
  approximate), so it maps cleanly to Minecraft blocks with no additional
  lossy conversion — confirmed by re-reading `voxel-geometry.ts`'s actual
  implementation during grill review, not assumed.

## 5. Dependencies

- `lib/voxel-types.ts`, `components/VoxelTerrain/voxel-geometry.ts` (done,
  on master) — the block-placement math this epic reuses.
- `lib/content-engine-resolution.ts`'s `SAFE_SLUG_PATTERN` precedent (done,
  on master) — reused for the route handler's slug validation.

## 6. Decisions made without a blocking gate (operator asked to keep moving)

1. Sponge Schematic (`.schem`) format, not a full Anvil world export.
2. `prismarine-nbt` for NBT encoding — a real, maintained dependency, not a
   hand-rolled binary format.
3. Server-side route handler, not client-bundled.
4. Reuse `voxel-geometry.ts`'s existing block-placement logic via a shared
   band-classification refactor, not a parallel reimplementation.
