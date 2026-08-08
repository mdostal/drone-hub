# `<VoxelTerrain>` + `<VoxelStructure>` — blocky voxel terrain renderer (hive spec)

> Render a `VoxelGrid` (a flat integer height-per-cell grid) as a Minecraft-style
> blocky terrain — instanced cubes, height-banded color, orbit-controllable — with an
> optional procedural structure (a simple house silhouette) resting on top. Plug-and-play,
> importable into personal-site, publicly showcased at `/components/voxel-terrain` (not
> gated — see `docs/components/content-engine.md` for the one gated page that also uses
> this component).

**Design discussion (RESOLVED architecture — read first):**
`.pHive/epics/minecraft-content-engine/docs/design-discussion.md` — this doc documents
those decisions, it does not re-derive them.

## Why (operator intent — honor this)

The operator's own framing (CLAUDE.md's 2026-08-07 priority order, position 3 of 4):
"landscape to minecraft so that I can take the 3d model and the landscape and put a
sample house or structure in place for the content engine where I let people see the
engineering, the minecraft of it, the flight docs, etc." `<VoxelTerrain>` is the
"minecraft of it" half of that; `docs/components/content-engine.md` covers the page that
composes it alongside the engineering/flight-log panels.

This is a **standalone 3D scene**, not a map overlay — unlike the land-overlay epic's
`GeoAnchoredModel`/`createModelLayer` (raw three.js drawn into MapLibre's own WebGL
context and render loop, see `docs/components/land-overlay.md`), `<VoxelTerrain>` reuses
`<Model3D>`'s r3f/drei stack (`<Canvas>` + `<Bounds>` auto-framing + `<OrbitControls>`,
see `components/Model3D/Model3D.tsx`) because there's no map to composite into here —
just a mesh in its own canvas, the same shape of problem `<Model3D>` already solved.

## The data type — `VoxelGrid` (`lib/voxel-types.ts`)

```ts
export interface VoxelGrid {
  slug: string;    // stable slug identifying the source property, e.g. "2806-prado"
  title: string;   // human-readable title
  size: number;    // grid is size x size cells
  heights: number[]; // flat row-major array of integer block heights; length === size*size
}
```

`heights[row * size + col]` is the block height (a small positive integer, e.g. 1-8) at
that cell. This is **data shape only** — deliberately no color/material/texture field,
mirroring `lib/layer-types.ts`'s `LayerDef` staying free of rendering detail: coloring is
`<VoxelTerrain>`'s own concern (see "Height-band coloring" below), not baked into the
data. `heights.length === size * size` is enforced by convention (the type can't express
it structurally) and checked at runtime by
`public/minecraft-samples/2806-prado/heightmap.json`'s own test —
`public/minecraft-samples/2806-prado/heightmap.test.ts` — via a hand-written
`assertVoxelGrid` runtime type-guard, not just a `tsc` cast, since a JSON import has no
literal-type narrowing to check the actual committed values against.

## Heightmap data prep — offline script, real terrain, tuned by observation

`public/minecraft-samples/2806-prado/heightmap.json` is derived from real data already in
this repo: `public/layer-viewer-samples/2806-prado/hillshade.tif`, the uint8
synthetic-elevation COG `<LayerViewer>`'s sample data already established as public-safe.
**Updated 2026-08-08:** `hillshade.tif` was reprojected from EPSG:32621 to EPSG:3857 to
fix a `@geomatico/maplibre-cog-protocol` bounds bug (see
`docs/components/land-overlay.md`'s "Fixed" section) — its pixel dimensions shifted from
512×512 to 549×522 and its value range from 78–216 to 0–213 as a result of bilinear
resampling. `heightmap.json` was regenerated from the reprojected file using the same
derivation described below, so it stays self-consistent with the committed `hillshade.tif`.
This is deliberately **not** a client-side
GeoTIFF-decoding dependency — a one-time offline Python/rasterio script (matching the
pattern already used to generate the hillshade COG itself) does the conversion; only its
JSON output is committed, per this repo's established throwaway-script convention (the
script itself was intentionally not committed — see
`.pHive/epics/minecraft-content-engine/stories/minecraft-types-and-heightmap.yaml`'s
`do_not`).

**The conversion, concretely:**

1. **Average-pool** the 512×512 pixel grid down to a coarser N×N grid — each output cell
   is the mean of the corresponding block of source pixels (e.g. at 32×32, each cell
   averages a 16×16 pixel block).
2. **Quantize** each cell's averaged value from the source's `[78, 216]` pixel range into
   a small integer height band, `[1, 8]` — exactly how Minecraft-style heightmap terrain
   generation works.
3. **Write** `public/minecraft-samples/2806-prado/heightmap.json` conforming to
   `VoxelGrid`, `slug: "2806-prado"`, `title` reflecting that it's derived sample terrain
   (not real photogrammetry — 2806 Prado has no real DSM yet, per CLAUDE.md's Phase-0
   blocker).

**Grid size — 32×32, tuned by lag-1 spatial autocorrelation, not guessed.** The story
explicitly called for a live-tune-and-document decision (the same precedent as
land-overlay's model-scale search), not an arbitrary pick. Candidate sizes 8/16/24/32/48/
64/128 were compared by computing each candidate grid's **lag-1 spatial autocorrelation**
— the Pearson correlation between the grid and itself shifted by one column, i.e. "how
similar is a cell to its immediate horizontal neighbor" (the same statistic
`heightmap.test.ts`'s "adjacent cells are spatially correlated" test checks against the
committed grid, threshold `> 0.5`). Real terrain has high spatial autocorrelation
(neighboring cells share similar elevation); pixel-level sensor noise does not. Measured:
**0.536 at size 8 → 0.856 at 32 → 0.925 at 64.** Higher isn't automatically better here —
16 was visibly too coarse (the hillshade's real ridge/basin structure blurred to mush at
that resolution), while 64 mostly just re-exposed the source pixel data's own noise floor
as macro-scale "terrain" rather than adding genuine additional structure, at 4× the voxel
count (and therefore 4× the draw burden — see "Instancing" below). **32 landed as the real
terrain-vs-mush/noise sweet spot** — high enough autocorrelation to read as coherent
terrain, low enough resolution to stay a recognizably *blocky* Minecraft aesthetic rather
than a smooth heightfield.

**Verification, not just visual judgment.** `heightmap.test.ts` (kept, not throwaway — it
re-runs under `npm test` and catches drift if the sample data or `VoxelGrid`'s shape ever
changes) checks, against the actual committed `heightmap.json`:

- The shape type-checks as a `VoxelGrid` and `heights.length === size * size === 1024`.
- Real variation exists: at least 4 distinct height bands, standard deviation `> 0.5` (not
  a flat plateau).
- Adjacent-cell (lag-1) spatial correlation `> 0.5` (terrain-like, not random per-cell
  noise).
- **Independent re-derivation**: if `python3`/`rasterio` are available on the test
  machine, the test re-reads the actual `hillshade.tif`, re-pools it to 32×32 in Python,
  and asserts the result correlates `> 0.95` with the committed JSON values — proof the
  committed grid genuinely reflects the real source pixel gradient, not just "any"
  variation that happens to look plausible. Skipped (not failed) if `python3` isn't on
  `PATH`, matching the layer-viewer sample data's own `rio-cogeo`-availability skip
  pattern.

## The components — `<VoxelTerrain>` / `<VoxelStructure>` (`components/VoxelTerrain/`)

```tsx
import { VoxelTerrain, VoxelStructure } from "@/components/VoxelTerrain";
import type { VoxelGrid } from "@/lib/voxel-types";
import sampleGrid from "@/public/minecraft-samples/2806-prado/heightmap.json";

const grid = sampleGrid as VoxelGrid;

<VoxelTerrain grid={grid}>
  <VoxelStructure grid={grid} gridX={16} gridZ={16} />
</VoxelTerrain>
```

```ts
export interface VoxelTerrainProps {
  grid: VoxelGrid;
  /** Rendered inside the SAME <Canvas>/<Bounds> as the terrain — the slot
   *  <VoxelStructure> (or any other r3f content) composes into. */
  children?: ReactNode;
  className?: string;
}

export interface VoxelStructureProps {
  /** The SAME grid passed to the enclosing <VoxelTerrain> — used to look up the
   *  terrain height at (gridX, gridZ) so the house rests on top of it, not floating
   *  above or sunk into it. */
  grid: VoxelGrid;
  gridX: number;   // grid column (0-indexed) the house is centered on
  gridZ: number;   // grid row (0-indexed) the house is centered on
  width?: number;   // footprint width in blocks (X axis). default 5
  depth?: number;   // footprint depth in blocks (Z axis). default 5
  wallHeight?: number; // wall height in blocks, before the roof starts. default 3
}
```

**`<VoxelTerrain>`** owns the `<Canvas>`: a two-light rig (ambient + directional, same
"glTF/PBR materials render solid black with zero lights" lesson land-overlay's showcase
story learned live, applied here from the start rather than rediscovered), an initial
camera position roughly proportional to `grid.size` (so the pre-`<Bounds>`-fit frame isn't
wildly off), and `<Bounds fit clip observe margin={1.2}>` wrapping both the terrain and
`children` — the same auto-framing convention `<Model3D>` established, fitting the camera
to the rendered content's actual bounding box on mount and re-fitting if it changes.
`<OrbitControls makeDefault />` registers as the r3f store's active controls so `<Bounds>`'s
fit animation and orbit controls cooperate instead of fighting, again mirroring
`<Model3D>`.

**`<VoxelStructure>` is not a standalone component** — it's an r3f element with no
`<Canvas>` of its own, meant to render as a *child* of `<VoxelTerrain>` so it shares that
Canvas's WebGL context, camera, and `<Bounds>` auto-framing (mounting it outside a
`<VoxelTerrain>` throws — r3f elements like `<instancedMesh>` only exist inside a Canvas's
render tree). It requires the *same* `grid` prop as the enclosing `<VoxelTerrain>` — not
just `gridX`/`gridZ` — specifically so it can look up the terrain's own height at that
cell (`heightAt` in `voxel-geometry.ts`) and stack its walls starting exactly there; this
is what guarantees the house sits *on* the terrain surface rather than floating above or
sinking into it, using the identical `gridToWorldX`/`gridToWorldZ`/level-to-Y math
`<VoxelTerrain>` uses for its own ground blocks, not an independently-guessed offset.

**The house shape** (`buildHouseBlocks` in `voxel-geometry.ts`): a hollow-perimeter box for
walls (`width` × `depth` footprint, `wallHeight` blocks tall — hollow, not solid, so it
reads as walls rather than a filled block), topped by a stepped pyramid roof that shrinks
by one cube per side per level until it caps out (or the footprint can't shrink further).
Procedural cubes only, deliberately **not** a reused glTF (unlike land-overlay's reused
sample duck) — the design discussion records this as a genuine visual/technical fit call,
not just "avoid a new asset": a smooth-shaded organic model sitting on a blocky voxel
terrain would look like an import mistake, while a procedural block-house reuses the exact
same cube-instancing primitive the terrain itself needs, and is the only option that's
visually consistent with the blocky aesthetic by construction. No Minecraft assets or
textures are used or needed anywhere in this component family — it's an original blocky
look, not an emulator.

### Height-band coloring

`heightBandColor(level)` in `voxel-geometry.ts` colors a block by its **stacked level**
within its column (1 = the ground layer, increasing upward) — not by the column's total
height. A small, fixed 3-band palette: grass-green (levels 1–3) → dirt-brown (4–5) →
stone-grey (6+). This is what gives tall columns a layered look (valleys/low ground read
green, peaks read grey, matching how real terrain actually looks) instead of every block
in a tall column being uniformly colored by that column's max height.

### Instancing — the performance requirement, verified live

A 32×32 grid with height-stacking is several thousand cubes (the real sample: 4,000+
terrain blocks), plus ~80 more for the house structure. Rendering one `THREE.Mesh` per
cube at that count is not a style choice to avoid — it's a genuine performance floor the
design discussion flagged explicitly ("a real requirement, not a preference... this should
be verified live, not just assumed correct because the code compiles"). Both
`<VoxelTerrain>` and `<VoxelStructure>` render through the same shared primitive,
`VoxelInstances` (an internal, non-exported function in `VoxelTerrain.tsx`, deliberately
reused by both rather than each component inventing its own instancing path): it wraps
drei's `<Instances>`/`<Instance>` — a thin API over a single `THREE.InstancedMesh` — around
a flat list of `{position, color}` placements (`voxel-geometry.ts`'s `buildTerrainBlocks`/
`buildHouseBlocks`), producing **one draw call per block list**, not one per cube.

**How this was actually verified** (not just "the code calls `<Instances>`, so it must be
fine"): live, against the real running dev-preview route, by monkey-patching
`WebGLRenderingContext.prototype.draw*` (the actual GL draw-call entry points) and
counting invocations for a full scene render. Result: **4 instanced draw calls total, 0
plain per-cube draw calls**, for a scene with 4,000+ terrain blocks plus ~80 house blocks
— direct evidence the `<Instances>` wrapper is genuinely producing instanced GL calls, not
silently falling back to a mesh-per-cube path if drei's API were ever misused. The same
live pass also confirmed: real height variation visibly renders as green/brown/grey bands,
the house sits on the terrain surface (not floating or embedded), drag/scroll genuinely
rotate/zoom the view (the rendered frame changed materially in response), and there's no
multi-second freeze on mount (~445ms to the first real frame, `requestAnimationFrame` kept
firing afterward) — the story's live jank-check proxy. This numeric-verification-over-
code-inspection approach is the same discipline the land-overlay epic established for its
own hardest-to-get-wrong rendering work (see `docs/components/land-overlay.md`'s "numeric
verification approach").

### The pure, unit-tested core vs. the WebGL-dependent shell

`voxel-geometry.ts` deliberately holds every piece of logic that doesn't need a live
Canvas/WebGL context — `gridToWorldX`/`gridToWorldZ` (grid-cell → world-space centering),
`heightAt` (grid-index lookup, throws on an out-of-bounds cell rather than silently
clamping — a mis-specified structure position is a bug worth surfacing loudly), the
height-band color mapping, and both block-list builders — split out of
`VoxelTerrain.tsx`/`VoxelStructure.tsx` specifically so this math is unit-testable without
a browser, the same "extract pure/testable logic out of a `'use client'` r3f component"
precedent `components/Model3D/Model3D.tsx`'s `toErrorMessage` extraction and
`lib/maplibre-model-layer.ts`'s pure-matrix-helpers set. `voxel-geometry.test.ts` covers
this with 14 ordinary Vitest unit tests — no WebGL, no r3f, no jsdom canvas shimming
needed. What's *not* unit-tested this way — whether `<Instances>` actually issues instanced
GL draw calls, whether the rendered pixels are visually correct — is exactly the live,
Playwright-adjacent verification described above; jsdom has no WebGL, so `npm test`'s
coverage of the rendering shell stops at "the right props/children are composed," by
construction, not by oversight.

## Usage

```tsx
"use client";
import dynamic from "next/dynamic";
import type { VoxelGrid } from "@/lib/voxel-types";
import sampleGrid from "@/public/minecraft-samples/2806-prado/heightmap.json";

// Heavy client-only WebGL viewer (@react-three/fiber's <Canvas>) — CLAUDE.md's
// "every heavy viewer = next/dynamic({ssr:false})" convention, same as every
// other viewer in this stack.
const VoxelTerrainDemo = dynamic(() => import("./VoxelTerrainDemo"), { ssr: false });

// VoxelTerrainDemo.tsx:
import { VoxelStructure, VoxelTerrain } from "@/components/VoxelTerrain";
const grid = sampleGrid as VoxelGrid;

export default function VoxelTerrainDemo() {
  return (
    <VoxelTerrain grid={grid} className="h-full w-full">
      <VoxelStructure grid={grid} gridX={16} gridZ={16} />
    </VoxelTerrain>
  );
}
```

`VoxelInstances` (the shared cube-instancing primitive) is deliberately **not** exported
from `components/VoxelTerrain/index.ts` — it's an internal rendering detail, same as
`Model3D.tsx`'s `toErrorMessage` staying un-re-exported. Only `VoxelTerrain`/
`VoxelTerrainProps` and `VoxelStructure`/`VoxelStructureProps` are public. Both components
are copy-portable into a standalone consumer like personal-site — everything they
transitively import is scoped to `components/VoxelTerrain/` + `lib/voxel-types.ts`, no
`app/` or gating dependency, same precedent as `components/Model3D/index.ts` and
`components/LayerViewer/index.ts`.

The public showcase page lives at `/components/voxel-terrain`
(`app/(showcase)/components/voxel-terrain/page.tsx`), public/ungated, following the
standing showcase-site pattern (see `.pHive/CONTEXT.md`). The one gated consumer is
`/properties/[slug]/engine` — see `docs/components/content-engine.md`.

## Phase fit

- **This epic:** `<VoxelTerrain>` + `<VoxelStructure>` — instanced-mesh blocky terrain
  renderer, reusing `<Model3D>`'s r3f/drei stack (not land-overlay's harder MapLibre
  custom-layer approach, since there's no map to composite into for a standalone voxel
  scene).
- **Deferred, not this epic's scope:** per-property real DSM-derived terrain (today, the
  same sample 2806-prado grid is shared across every slug on the gated content-engine
  page — see `docs/components/content-engine.md`'s note on this). Once real per-property
  WebODM/DSM output exists, terrain would need the same per-slug real-vs-fallback
  resolution pattern the engineering/flight-log content already has.
- **Next (per the operator's 2026-08-07 priority order):** the telemetry-driven video
  overlay epic is queued after this one; it does not extend `<VoxelTerrain>` or
  `VoxelGrid` — see `docs/components/content-engine.md`'s note on `FlightLogEntry`'s
  scope for the same anti-speculation precedent applied to that epic's own future type.
