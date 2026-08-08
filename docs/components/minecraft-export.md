# Minecraft export — real `.schem` download for `<VoxelTerrain>` (hive spec)

> **This is not a new plug-and-play component.** It's a download feature bolted
> onto the terrain data the `minecraft-content-engine` epic already renders
> (see `docs/components/voxel-terrain.md`, which this doc assumes): given a
> `VoxelGrid` (+ optional house structure), produce a real, spec-compliant
> Minecraft Sponge Schematic (`.schem`) file that a player can drop into an
> actual Minecraft Java Edition world via WorldEdit's `//schem load` or
> Litematica. There is no `<MinecraftExport>` component — you hit
> `GET /api/minecraft-export` and get a binary file back.

**Update (operator, 2026-08-08):** drone-hub carries no gating of any kind — every
reference below to `middleware.ts`, `lib/gate.ts`, or a passcode gate describes an
architecture that no longer exists in this repo (kept as historical record). This route
was always ungated in practice (see below); the correction is that NOTHING else in this
repo is gated either now, so "intentionally not behind the gate" is no longer a
distinguishing property.

**Design discussion (RESOLVED architecture — read first):**
`.pHive/epics/minecraft-export/docs/design-discussion.md` — this doc explains
those decisions for a maintainer, it does not re-derive them.

## Why a `.schem` file, not a full world export

`<VoxelTerrain>`/`<VoxelStructure>` (the `minecraft-content-engine` epic,
already shipped) render a Minecraft-*styled* three.js scene — a good-looking
approximation, not a file real Minecraft can open. The operator's actual ask
("export the webodm or something to minecraft") requires a real, loadable
file, and design-discussion.md section 2, point 1 is explicit about which
real-file format that should be:

- **Sponge Schematic (`.schem`) — a single, portable, NBT-encoded,
  gzip-compressed file representing one buildable structure.** This is the
  standard format WorldEdit, Litematica, and effectively every "export a
  build to Minecraft" tool (including WebODM-adjacent GIS-to-Minecraft
  projects) uses for exactly this use case: download a build, paste it into
  an existing world with `//paste`.
- **Not the Anvil world format** (folders of region `.mca` files,
  chunk-indexed, plus `level.dat`, player state, spawn points, and the rest
  of the machinery a full *world* needs). That's a categorically larger
  scope than "download and load a structure into Minecraft" actually
  requires — the operator wants a build the player pastes into a world they
  already have, not a new world to boot into. Sponge Schematic is the
  correctly-scoped target, not a lesser substitute for a "real" world export.

Within Sponge Schematic, the writer targets **v2, not v3**: v2 is the format
WorldEdit has supported the longest and the one most third-party
tools/older WorldEdit builds still read reliably, and this writer only needs
the baseline v2 tag set (`Version`/`DataVersion`/`Width`/`Height`/`Length`/
`PaletteMax`/`Palette`/`BlockData`/`Metadata`) — none of v3's additional
features (its own `Palette` sub-compound nested under `Schematic.Blocks`,
biome palette, etc.) are used, so there's no reason to take on v3's more
complex nesting for capability this exporter doesn't need. See
`lib/minecraft-schematic.ts`'s own header comment for the same reasoning
in the code.

## The writer's three real steps (`lib/minecraft-schematic.ts`)

An early design draft described this as "map bands to blocks, write NBT" —
one step. A grill review during planning caught that this hand-waved two
genuinely separate pieces of real work. The shipped writer has three
distinct steps, each reviewable on its own:

### 1. Block classification (reused, not duplicated)

`components/VoxelTerrain/voxel-geometry.ts` already knows, for the three.js
renderer, which height band (`"low"` / `"mid"` / `"high"`) a stacked block
belongs to (`classifyHeightBand`) and which part of the procedural house a
cell belongs to (`"wall"` / `"roof"`). The refactor that made this epic
possible split that classification out from the renderer's own
centered/fractional coordinate math so **both** the three.js color mapper
(`heightBandColor`) and this epic's Minecraft-block mapper
(`lib/minecraft-block-palette.ts`'s `blockForTerrainBand`/
`blockForStructurePart`) call the exact same `classifyHeightBand` /
`StructurePart` logic — the band rules live in one place, not two. Two new
exported functions in `voxel-geometry.ts`, `terrainCells()` and
`houseCells()`, expand a `VoxelGrid` (+ optional house placement) into flat
lists of raw cells, each already carrying its classification. The schematic
writer's `buildBlockIdGrid()` consumes these directly.

### 2. Integer coordinate mapping — and why it does NOT reuse the three.js transform

This is the correction the design discussion spends the most words on
(section 2, point 2b), because it's the one most likely to look like free
reuse and actually be a subtle bug.

`voxel-geometry.ts`'s existing `gridToWorldX`/`gridToWorldZ` produce
**centered, fractional** three.js display coordinates — e.g.
`col - (size - 1) / 2` for X, `(stackLevel - 0.5)` for Y — specifically so
the rendered scene sits centered on the origin for `OrbitControls`. Reusing
those directly for the export would mean flooring/rebasing fractional
values back onto a zero-origin integer grid, and a grill review correctly
flagged the real risk in that: two distinct fractional positions can round
to the *same* integer cell, silently overwriting one block with another,
with no test catching it (a same-library round-trip test wouldn't catch it
either — see the verification section below).

**The fix: the exporter never touches the three.js transform at all.**
`terrainCells()`/`houseCells()` expose each cell's **raw grid indices**
directly — `col`, `row`, `stackLevel` — which are already exactly what a
Sponge Schematic wants: a dense, zero-origin, non-negative-integer grid,
with no centering and no fractional risk by construction. The renderer
keeps its own centered/fractional transform for display
(`buildTerrainBlocks`/`buildHouseBlocks` still call `gridToWorldX`/`Z`); the
schematic writer's `buildBlockIdGrid()` (`lib/minecraft-schematic.ts`) is
the **only** place export coordinates are consumed, and it works
exclusively off the raw integers via `cellIndex(x, y, z, width, length) = x
+ z*width + y*width*length` — the Sponge spec's own documented flat-array
indexing.

### 3. Palette / VarInt `BlockData` encoding

The part a first pass entirely skipped. Sponge Schematic's `BlockData` tag
is not a flat array of block-ID strings — it's a specific two-part
encoding:

- **`Palette`**: every *unique* block-state string seen across the dense
  grid (including `minecraft:air` for empty cells, since the grid is dense,
  not sparse — every position from `(0,0,0)` to `(Width,Height,Length)`
  needs an entry) gets the next sequential integer index, in first-seen
  order, starting at 0. `buildPalette()` does exactly this over the flat
  `blockIds` array `buildBlockIdGrid()` produces. `PaletteMax` is the
  resulting palette's size.
- **`BlockData`**: the spec's documented iteration order is **Y outermost,
  then Z, then X innermost** (X increments fastest) — `encodeBlockData()`
  iterates explicitly in that exact nesting (rather than relying on an
  equivalent-but-less-obvious flat-array fill order) so the emission order
  is auditable at a glance. Each cell's palette index is VarInt-encoded: the
  same LEB128-style variable-length integer scheme Minecraft's own network
  protocol and the Sponge spec both use — 7 payload bits per byte, a
  continuation bit (`0x80`) set on every byte except the last
  (`encodeVarInt()`). The resulting unsigned bytes are reinterpreted into
  Java's signed byte range (`toSignedSchematicByte()`) immediately before
  going into NBT's `ByteArray` tag, since `ByteArray` stores signed bytes
  and a real Sponge Schematic reader reverses this with `& 0xFF` — a
  lossless, standard round-trip, not a narrowing hack.

`prismarine-nbt` builds the actual NBT compound tag tree
(`nbt.comp`/`nbt.int`/`nbt.short`/`nbt.byteArray`/`nbt.string`) and
serializes it (`nbt.writeUncompressed`); this file does not hand-roll any
NBT binary encoding. Node's `zlib.gzipSync` compresses the serialized bytes
— `writeUncompressed` does exactly what its name says and does not gzip on
its own, so gzipping is this file's job, not the library's.

## The `DataVersion`: 3465 (Minecraft Java Edition 1.20.1) — two independent sources

Sponge Schematic's `DataVersion` tag must match a real Minecraft version or
WorldEdit may reject/misinterpret the file. Design-discussion.md's risk
section required the chosen value be confirmed against **two independent
sources**, not a single lookup trusted on its own. Both are documented in
the code, not just in this doc:

1. **Minecraft Wiki** — `lib/minecraft-schematic.ts`'s header comment cites
   the per-version infobox at
   `https://minecraft.wiki/w/Java_Edition_1.20.1` ("Data version: 3465"),
   fetched during the writer story's research step.
2. **misode/mcmeta** — `lib/minecraft-schematic.golden-fixture.test.ts`'s
   section-2 comment block cites a genuinely separate source: the
   `summary/versions/data.json` branch of
   `https://github.com/misode/mcmeta`, a well-known, actively maintained
   repository (maintained by "misode," whose Pack.mcmeta Generator/Data Pack
   tooling and "Versions Explorer" are standard references in the Minecraft
   technical-tooling community) that auto-generates and version-controls
   Minecraft's own generated data by running Mojang's official data
   generators against every release — i.e. it's derived from Mojang's
   tooling output, not hand-transcribed from the Wiki, making it a real
   cross-check rather than a mirror of the same claim. It was fetched
   directly (`curl -s
   https://raw.githubusercontent.com/misode/mcmeta/summary/versions/data.json`),
   not summarized by a search engine; the entry for id `"1.20.1"` reads
   `"data_version": 3465`, agreeing with the Wiki value.

1.20.1 itself was picked (over a newer or snapshot release) because the
design discussion asked for "a specific, well-known stable Java Edition
release" — a widely-used, non-snapshot, hotfix-stable version, since
snapshot/pre-release DataVersions can be revised. `DATA_VERSION = 3465` and
`SCHEMATIC_VERSION = 2` are both exported constants from
`lib/minecraft-schematic.ts`.

## The API route (`app/api/minecraft-export/route.ts`)

`GET /api/minecraft-export?slug=<slug>` — a Next.js Route Handler, server-side
only. `buildSchematic()` pulls in `prismarine-nbt` and `node:zlib`, neither
of which belong in the client bundle; a Route Handler is the right shape
because the response *is* the artifact (a binary file with download
headers), not HTML.

- `slug` is optional; the default and the fallback for any invalid/unknown
  slug is `"2806-prado"` (`DEFAULT_SLUG`) — the same sample every
  showcase/content-engine page already renders.
- Validated against `SAFE_SLUG_PATTERN`
  (`lib/content-engine-resolution.ts`, the same path-traversal guard
  established by the `minecraft-content-engine` epic), reused rather than
  reimplemented; a slug that fails the pattern or has no
  `public/minecraft-samples/<slug>/heightmap.json` on disk falls back to
  `DEFAULT_SLUG` rather than 404ing or throwing.
- Loads the resolved slug's `heightmap.json` as a `VoxelGrid`, calls
  `buildSchematic(grid, STRUCTURE_PLACEMENT)` (the same house placement —
  centered at grid cell `(16, 16)` — the showcase page's own 3D view uses,
  so the download matches what's rendered on screen), and returns the
  gzip-compressed `Buffer` with `Content-Type: application/octet-stream` and
  `Content-Disposition: attachment; filename="<slug>.schem"`.
- **Intentionally not behind `middleware.ts`'s passcode gate.** The only
  data this route can ever serve is whatever already lives under
  `public/minecraft-samples/**`, which is already public — the same JSON
  the public `/components/voxel-terrain` showcase page imports directly.
  Re-deriving a schematic from already-public JSON exposes nothing gating
  that JSON wouldn't already fail to protect (the same public-sample-data
  reasoning the `model3d` epic established). This route is **not** in
  `lib/gate.ts`'s `GATED_PATH_PREFIXES` or `middleware.ts`'s matcher, and
  should stay that way unless the underlying sample data itself becomes
  gated.

## UI entry points

Two plain download anchors, no client state or loading spinner (the
browser's native download handling covers it):

- **`app/(showcase)/components/voxel-terrain/page.tsx`** (public,
  ungated) — `<a href="/api/minecraft-export?slug=2806-prado" download>
  Download for Minecraft</a>`, placed directly under the live
  `<VoxelTerrainDemo>` viewer so it's unambiguously "download *this*
  terrain," not a generic site-wide action.
- **`app/properties/[slug]/engine/EnginePageClient.tsx`** (public, ungated) —
  `<Link href={\`/api/minecraft-export?slug=${encodeURIComponent(slug)}\`}
  download>Download for Minecraft</Link>`, placed under the page's own
  `<VoxelScene>` in the "The Minecraft of It" section. This uses the
  page's **real** `slug` prop, not a hardcoded sample — the API route falls
  back to `2806-prado` today only because that's the only slug with sample
  data on disk; once a real `public/minecraft-samples/<slug>/heightmap.json`
  exists for a given property, this link picks it up automatically with no
  code change.

## Verification — what was checked, and what honestly could not be

**Full in-game verification — actually loading the exported `.schem` file in
a real Minecraft Java Edition client via WorldEdit's `//schem load` or
Litematica — was NOT possible in this environment. There is no Minecraft
client available here.** This is stated plainly, not as a footnote: it is a
real, acknowledged gap in this epic's verification, the same limitation
design-discussion.md's risk section calls out explicitly ("Spec correctness
is unverifiable in-game in this environment"), and the same honesty
precedent `docs/components/land-overlay.md` set for what its numeric
placement work could and couldn't verify. **The operator should load a real
exported `.schem` file into an actual Minecraft client on first real use, and
treat that as the true acceptance test this environment could not run.**

What *was* done — the strongest verification achievable without a real
client — lives in `lib/minecraft-schematic.golden-fixture.test.ts`:

- **Hand-verified golden fixtures (the primary check).** Two small
  (2×2×2-or-smaller) `VoxelGrid` fixtures were traced through the documented
  Sponge Schematic v2 spec and this codebase's own terrain/palette rules
  **by hand, on paper** — reading `lib/minecraft-schematic.ts`,
  `lib/minecraft-block-palette.ts`, and `voxel-geometry.ts`'s source as a
  spec to work through, before ever calling `buildSchematic()` — to derive
  the expected `Palette`, `PaletteMax`, and VarInt-encoded `BlockData` byte
  sequence. Only after those expected values were written down in the test
  file's comments was `buildSchematic()` actually invoked, decompressed, and
  parsed with `prismarine-nbt`, and its real output compared against the
  hand-derived values. Fixture A (uniform heights) exercises a
  single-entry palette; Fixture B (one tall column, three empty) exercises a
  two-entry palette, a non-zero VarInt index, and real air cells in the same
  `BlockData` sequence — deliberately two fixtures because Fixture A alone
  never emits a non-zero palette index and is a weak check of the encoding
  on its own.

  **Why this specific check matters, and why a same-library round-trip test
  does not substitute for it:** a round-trip test that writes with
  `prismarine-nbt` and reads back with `prismarine-nbt` only proves the
  library is a fixed point of its own serialization. It would pass
  identically whether `lib/minecraft-schematic.ts` understood the Sponge
  Schematic v2 spec correctly, or consistently-but-wrongly — e.g. iterating
  X-outer/Y-inner instead of the spec's actual Y-outer/X-inner order. Both
  the write and read side would apply the same wrong order and agree with
  each other; a same-library round-trip cannot tell the difference. The
  hand-derived fixtures can, because the expected values were fixed
  independently of the code under test.
- **`DataVersion` cross-reference**, described above — two independent
  sources, both agreeing on 3465.
- **Same-library round-trip test** (`lib/minecraft-schematic.test.ts` and
  the golden-fixture file's own section 3) — retained deliberately as a
  **secondary** sanity check (valid gzip, all required NBT tags present,
  internal `Palette`/`PaletteMax`/`BlockData`-length consistency), explicitly
  *not* presented as sufficient spec-conformance verification on its own.

This project's convention going forward (see the `.pHive/CONTEXT.md` entry
this story added) generalizes the lesson: for any binary/interop file format
this codebase writes, a same-library round-trip is not enough — a
hand-verified golden fixture, derived independently of the code under test,
is required.

## Dependencies

`prismarine-nbt` (`^2.8.0` in `package.json`) is a real, intentional
dependency — part of the maintained PrismarineJS ecosystem, used across many
Minecraft bot/tooling projects, confirmed reachable on the npm registry
during planning, and deliberately chosen over hand-rolling an NBT binary
encoder. It is not an accidental transitive addition.

## Usage

Not a component — the feature surface is the two download links above, both
hitting the same route:

```
GET /api/minecraft-export?slug=2806-prado
```

returns a gzip-compressed `.schem` file (`Content-Disposition: attachment;
filename="2806-prado.schem"`), loadable in Minecraft Java Edition via
WorldEdit's `//schem load 2806-prado` + `//paste`, or Litematica's schematic
import.

Programmatically, the writer itself is importable directly for any future
surface that wants a schematic without going through the HTTP route:

```ts
import { buildSchematic } from "@/lib/minecraft-schematic";
import type { VoxelGrid } from "@/lib/voxel-types";

const grid: VoxelGrid = /* ... */;
const schematic: Buffer = buildSchematic(grid, { gridX: 16, gridZ: 16 });
```

## Phase fit

- **`minecraft-content-engine` (done, prior epic):** `<VoxelTerrain>`/
  `<VoxelStructure>`, the Minecraft-*styled* three.js renderer — the
  block-placement math this epic reuses.
- **This epic:** the real Sponge Schematic v2 writer, the download route, and
  the two UI entry points — a genuinely loadable Minecraft file, decoupled
  from data source (it takes a `VoxelGrid`, not a specific pipeline), so it
  needs no rework once real WebODM/DSM-derived terrain exists for a real
  property (per CLAUDE.md's Phase-0 data pipeline).
- **Deferred, tracked but not built here:** full in-game verification (see
  "Verification" above) — the operator's job on first real use, not
  something this environment could complete.
