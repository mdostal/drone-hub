# Design Discussion — Landscape-to-Minecraft voxelizer + content-engine page

## 0. Prelude

**Confirmed priority (CLAUDE.md, operator 2026-08-07):** Model3D (done) →
3D-on-land overlay (done) → **Minecraft voxelizer/content-engine (this
epic)** → telemetry-driven video overlay → CBA's original Phase 2 tools.

**Operator's own framing (verbatim, from the request that opened this
scope):** "landscape to minecraft so that I can take the 3d model and the
landscape and put a sample house or structure in place for the content
engine where I let people see the engineering, the minecraft of it, the
flight docs, etc."

**Prior decisions directly relevant:** `<LayerViewer>`'s sample hillshade
(`public/layer-viewer-samples/2806-prado/hillshade.tif`) is a real, already-
public-safe 512×512 uint8 grayscale COG (synthetic elevation data, EPSG:32621,
values 78–216) — the natural, already-available terrain source. The land-
overlay epic established a MapLibre-custom-layer pattern for 3D-in-map
compositing; this epic's voxel terrain is NOT on the map (a standalone 3D
scene), so it reuses `<Model3D>`'s r3f/drei approach instead, per CLAUDE.md's
own framing ("three.js/r3f, same renderer as `<Model3D>`").

## 1. Goal

Convert the sample hillshade into a blocky, Minecraft-style voxel terrain
mesh, with a sample structure placed on it, composed into a NEW gated
per-property page (the "content engine") alongside sample engineering docs
and sample flight-log docs.

## 2. Proposed approach

1. **Heightmap → voxel grid (offline data prep, not a browser-side
   dependency).** A one-time script (Python/rasterio, matching the pattern
   already used to generate the synthetic hillshade itself) downsamples the
   512×512 hillshade COG to a coarse grid (e.g. 32×32) and quantizes each
   cell's pixel value into a small integer height (e.g. 1–8 blocks) —
   exactly how Minecraft-style heightmap terrain generation works. Output:
   a plain JSON grid (`public/minecraft-samples/2806-prado/heightmap.json`),
   NOT a new client-side GeoTIFF-decoding dependency — the React component
   just reads a flat array of integers, keeping the bundle light (same
   "local-first, simple pipeline" principle already established).
2. **`<VoxelTerrain>`** — `'use client'`, r3f/drei `<Canvas>` (same stack as
   `<Model3D>`, NOT the land-overlay epic's raw-three-in-MapLibre approach —
   this is a standalone scene, no map to composite into). Renders the
   heightmap grid as **instanced cube meshes** (`THREE.InstancedMesh`, not
   one mesh per block — a 32×32 grid with height stacking is potentially
   thousands of cubes; instancing is a real performance requirement, not a
   nicety, for a scene meant to actually run in a browser). Color/shade
   blocks by height band (a small, fixed palette — grass-green low, stone-
   grey high) for a genuine Minecraft look, not a literal texture-mapped
   recreation (no Minecraft assets are used or needed — this is an original
   blocky-aesthetic renderer, not an emulator).
3. **`<VoxelStructure>`** — a small, separate, composable piece: places a
   procedurally-defined cluster of colored cubes (a simple house shape —
   walls + a peaked roof) at a given grid position on top of the terrain.
   **Deliberately NOT a glTF import, unlike land-overlay's reused duck —
   different tradeoff, not the same one restated.** Grill asked whether a
   reusable primitive (e.g. the existing duck) was considered first: yes,
   and rejected on visual/technical fit, not just "avoid new assets" (which
   alone wouldn't distinguish this from land-overlay's choice). A smooth-
   shaded organic duck model sitting on a blocky voxel terrain would look
   like an import mistake, not a design; a procedural block-house reuses the
   EXACT SAME cube-instancing primitive `<VoxelTerrain>` already needs (not
   new 3D tech, just the same building block composed differently), and is
   the only option that's visually consistent with a "Minecraft" aesthetic
   by construction.
4. **New public showcase page**, `/components/voxel-terrain`, consistent
   with every other component in this framework — `<VoxelTerrain>` +
   `<VoxelStructure>` are genuinely reusable, generic components, and their
   sample heightmap is derived from data already established as public-safe
   (same rights class as `<LayerViewer>`'s existing sample data). Follows
   the model3d epic's convention exactly.
5. **New GATED content-engine page**, `/properties/[slug]/engine` —
   nested under the EXISTING `/properties/:path*` gate prefix (already in
   `middleware.ts`'s matcher from the layer-viewer epic), so no NEW gating
   *logic* is needed. (Grill noted `/properties/:path*`'s coverage — and
   `sanitizeNextPath`'s `startsWith("/properties")` check — are both
   unanchored string-prefix matches, not path-boundary-aware; that looseness
   pre-dates this epic and isn't made worse by it, so it's flagged here as a
   known characteristic worth hardening later, not something this epic needs
   to fix.)

   **CORRECTED after grill — per-slug content resolution with an explicit
   fallback state, not a hardcoded sample panel regardless of slug.** The
   original draft would have shown identical sample content on every
   property's `/engine` page forever, with no path to real content and no
   distinction between "this property has no data yet" and "this is generic
   demo content." Fix, mirroring conventions already established elsewhere
   in this codebase (`TourEdge.clip: null` → wipe fallback,
   `LayerDef.disabled: true` → no render): the page looks for per-slug real
   content at `public/content-engine/<slug>/{engineering.md,flight-log.json}`
   first; if absent, it falls back to a generic sample dataset
   (`public/content-engine/sample-house/`) and the page renders an explicit,
   visible "showing sample data — no real records exist yet for this
   property" banner. This also resolves a second grill finding: the
   *identical* sample terrain appearing on both the public showcase AND a
   passcode-gated property page would otherwise imply an exclusivity that
   doesn't exist — the explicit fallback banner makes clear the gated page
   isn't showing anything special yet, rather than silently presenting
   public demo content as if it were gated/exclusive.
6. **Sample flight-log data — type scoped to THIS epic's actual need, not
   speculatively designed for a future one.** CORRECTED after grill: the
   original draft designed `FlightLogEntry` with fields anticipated for the
   next epic's telemetry-driven camera-pose computation — grill correctly
   flagged this as inconsistent with this project's own established
   practice (`GeoAnchoredModel` was deliberately kept separate from
   `<Model3D>`'s `ModelDef` rather than pre-unified for land-overlay's then-
   future needs — see that epic's design discussion). Fix: design
   `FlightLogEntry` for what THIS epic actually displays — a simple flight
   log table/panel — and let the telemetry-video-overlay epic define
   whatever type IT actually needs when it's actually planned, same as every
   prior epic's own type got designed against its own real requirements, not
   a forecast of what comes next.
7. **Sample "engineering" content** — plain markdown/structured text (no
   real structural drawings exist), clearly labeled as sample/placeholder,
   matching the operator's own confirmed answer ("sample/placeholder for now").

## 3. Scale assessment

**Medium.** New component family (voxel terrain rendering) + a new gated
page + a data-prep step, but no new gating infrastructure (reuses
`/properties/*`) and no new hard rendering technique (reuses `<Model3D>`'s
r3f/drei stack, not land-overlay's harder MapLibre-custom-layer approach).
H/V slice planning applies.

## 4. Risks

- **Instancing performance is a real requirement, not a preference** — a
  naive one-mesh-per-cube implementation for a 32×32+ grid would tank frame
  rate. `THREE.InstancedMesh` (or drei's `<Instances>`/`<Instance>` wrapper)
  is required, and this should be verified live (frame rate / no visible
  stutter), not just assumed correct because the code compiles.
- **Rights-status discipline, again** (the model3d epic's near-miss
  established this convention): the content-engine page's sample engineering/
  flight-log content must be as clearly labeled "sample/placeholder, not
  real" as the video-tour showcase's demo-house tour was — even though this
  page IS gated (lower stakes than a public leak), presenting fabricated
  content as if it were real property intelligence would be its own kind of
  misleading, worth avoiding even behind a gate.
- **Heightmap downsampling choice (512×512 → e.g. 32×32) is a real design
  decision**, not arbitrary — too coarse loses any visual terrain character,
  too fine kills performance and readability of the "blocky" aesthetic. Left
  to the implementing story to tune by observation (same "live-tune and
  document why" precedent as land-overlay's model scale).

## 5. Dependencies

- `<Model3D>` (done) — the r3f/drei rendering approach this epic reuses.
- `<LayerViewer>`'s sample hillshade (done) — the terrain data source.
- The telemetry-driven video-overlay epic (queued next) depends on this
  epic's `FlightLogEntry` type existing first.

## 6. Decisions made without a blocking gate (operator asked to keep moving)

1. Offline Python/rasterio heightmap-prep script → static JSON, not a
   client-side GeoTIFF-decode dependency.
2. `THREE.InstancedMesh` for the voxel grid — a performance requirement.
3. Procedural block-house for the sample structure, not a new glTF import.
4. Content-engine page nested at `/properties/[slug]/engine` — no gating
   changes needed, reuses the existing `/properties/*` prefix.
5. `FlightLogEntry` type designed now for reuse by the next epic, not just
   this one's display needs.
