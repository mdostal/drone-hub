# Design Discussion — 3D-model-on-land overlay

## 0. Prelude

**Confirmed priority (CLAUDE.md, operator 2026-08-07):** Model3D (done) →
**3D-on-land overlay (this epic)** → Minecraft voxelizer/content-engine →
telemetry-driven video overlay → CBA's original Phase 2 tools.

**Prior decisions directly relevant:** `<Model3D>`'s `ModelDef {id,url,title}`
deliberately has no scale/position/geo-anchoring — this epic is where that
gets a real, purpose-built type instead of a guess. `<LayerViewer>` already
owns a MapLibre GL map internally (`components/LayerViewer/LayerViewer.tsx`)
and exposes an imperative ref handle `{toggleLayer, setOpacity, getLayers}`.

## 1. Goal

Composite a real 3D model onto `<LayerViewer>`'s georeferenced map, anchored
at a real lat/lon, so it's genuinely "in the land" — correctly scaled and
perspective-matched as the map pans/zooms/tilts, not a flat 2D icon pretending
to be 3D.

## 2. Proposed approach

**MapLibre GL JS's own documented "3D model via a custom layer" pattern —
this is not novel R&D, it's a well-established, widely-used recipe (MapLibre's
official examples gallery ships this exact technique; Mapbox GL JS, which
MapLibre forked from, documents the identical approach).**

MapLibre lets you register a **custom layer** (`CustomLayerInterface`) that
gets handed the map's raw WebGL context and is responsible for its own
`onAdd`/`render` calls, once per map frame. The standard recipe:

1. In `onAdd(map, gl)`: create a raw **three.js** scene, camera, and a
   `THREE.WebGLRenderer` constructed with `{ canvas: map.getCanvas(), context:
   gl }` — sharing MapLibre's own GL context rather than owning a separate
   one. Load the glTF via three.js's own `GLTFLoader` (NOT
   `@react-three/fiber`'s `<Canvas>`/`useGLTF` — those assume they own the
   render loop and WebGL context; a custom map layer must render INTO
   MapLibre's existing loop instead, so this has to be raw three.js, a
   genuinely different code path from `<Model3D>`'s r3f approach).
2. Convert the model's real-world lat/lon/altitude to Mercator space via
   `maplibregl.MercatorCoordinate.fromLngLat(lngLat, altitude)`, and build a
   model transform matrix (translate + scale, since Mercator units aren't
   meters — the scale factor comes from `MercatorCoordinate.meterInMercatorCoordinateUnits()`).
3. In `render(gl, matrix)`: MapLibre hands you its current projection matrix
   for this frame. Multiply it by the model's transform matrix, set that as
   the three.js camera's `projectionMatrix`, and call
   `renderer.render(scene, camera)`. This is what makes the model track the
   map's pan/zoom/tilt/bearing automatically — MapLibre owns the camera math,
   three.js just draws into the frame MapLibre gives it.

**New, purpose-built type** (per the deferral from the model3d epic):
`GeoAnchoredModel {id, url, title, lat, lon, altitudeMeters?, rotationDegrees?, scale?}`
— explicitly NOT the same shape as `<Model3D>`'s `ModelDef` (scene-space vs.
geo-space are genuinely different concerns, confirmed by actually needing this
type now).

**Integration point — CORRECTED after grill.** The original draft proposed
inlining the three.js custom-layer logic directly into `LayerViewer.tsx` and
called that "the smaller, more contained change." Grill correctly challenged
this: `LayerViewer.tsx`'s whole design goal (per its own test-suite story) is
pure, WebGL-free, unit-testable mapping functions
(`buildLayerMapConfig`/`addLayerToMap`) — bolting a raw `WebGLRenderer` +
`onAdd`/`render`/`onRemove` lifecycle directly into that file breaks that
property and mixes a third rendering paradigm into a file that's deliberately
kept to one. **Fix:** the custom-layer implementation is its OWN module —
`lib/maplibre-model-layer.ts` — exporting a factory
(`createModelLayer(model: GeoAnchoredModel): CustomLayerInterface`) that
`LayerViewer.tsx` merely instantiates and calls `map.addLayer()`/
`map.removeLayer()` with, the same way it already treats
`@geomatico/maplibre-cog-protocol` as an external module it wires in rather
than reimplements. `<LayerViewer>` gains one new prop (`models?:
GeoAnchoredModel[]`) and a small amount of glue code (add/remove layers when
the prop changes), not a rendering engine.

**Import-timing (grill finding 1) — the async-readiness gap.** `onAdd(map,
gl)` is called synchronously by MapLibre, but loading `three`/`GLTFLoader`
and fetching/parsing the glTF are both async. Fix, mirroring
`LayerViewer.tsx`'s existing `mapReadyRef` pattern: `createModelLayer`'s
`onAdd` kicks off the async chain (dynamic `import("three")` +
`GLTFLoader.load()`) but sets an internal `ready = false` flag; `render(gl,
matrix)` no-ops (returns immediately) until `ready` flips true once the model
has actually loaded and been added to the scene. No partial/undefined-state
render is possible.

## 3. Scale assessment

**Medium.** One genuinely hard new technique (the three.js/MapLibre camera
sync), but scoped to a single reusable module + a prop extension on an
existing component, no new gating/test infra. H/V slice planning applies.

## 4. Risks

- **This is the hardest rendering work in the project so far.** The
  three.js/MapLibre camera-sync math is well-documented but unforgiving —
  small matrix/unit mistakes (Mercator units vs. meters, row-major vs.
  column-major) tend to fail silently (nothing renders, or renders at the
  wrong scale/position) rather than erroring loudly.

  **CORRECTED after grill: qualitative "looks roughly right" verification is
  not enough for this epic.** Required verification method: use MapLibre's
  own `map.project(lngLat)` to compute the EXPECTED screen-pixel position for
  the model's anchor point, then compare that against the model's ACTUAL
  rendered position (e.g. read back the canvas/screenshot and locate the
  model's bounding-box centroid, or instrument the custom layer to report its
  computed screen-space centroid for the test to read). Do this at more than
  one camera state (at minimum: default pitch/bearing, plus one rotated/
  tilted state) — a matrix bug that happens to cancel out at pitch=0/bearing=0
  is a real, common failure mode this sweep is specifically designed to catch.
- **`@geomatico/maplibre-cog-protocol`'s COG rendering and this custom layer
  both need to coexist in the same map instance, and three.js WILL mutate GL
  state MapLibre doesn't expect.** CORRECTED after grill (previously
  unaddressed): three.js's `WebGLRenderer` changes depth/blend/cull/viewport
  state as a side effect of `render()`. `createModelLayer`'s `render()`
  implementation MUST call `renderer.resetState()` (three.js's own API for
  exactly this custom-integration scenario) before returning control to
  MapLibre, or subsequent layers (the ortho/hillshade/parcel-boundary raster/
  geojson layers) risk rendering corrupted after the model layer draws.
  Required acceptance criterion: toggle the ortho layer's visibility on/off
  AFTER the model layer has rendered at least one frame, and confirm it still
  renders correctly (not blank/corrupted) — this is the concrete regression
  test for GL state pollution, not just a mention in prose.
- **Sample placement:** the existing sample data's ortho/parcel sit at a real
  but arbitrary rio-tiler test extent (~73.47°N, high Arctic — not survey
  data, per the layer-viewer epic's provenance notes). Placing the sample
  duck model within that same extent (near the synthetic parcel boundary) is
  the natural, already-available anchor point — no new geospatial sourcing
  needed this epic.
- **Cleanup — CORRECTED after grill from "same discipline" (asserted) to
  concrete requirements:**
  - An in-flight `GLTFLoader.load()` at unmount time must be guarded by a
    `cancelled` flag checked before `scene.add(gltf.scene)` — the identical
    pattern `LayerViewer.tsx`'s own manifest-resolution effect already uses
    for its `fetch()` call, applied here to the async model load.
  - `onRemove` disposes every geometry/material/texture the loaded glTF
    created (three.js objects don't auto-garbage-collect GPU resources) and
    drops the renderer reference.
  - Toggle (`GeoAnchoredModel` visibility, if the epic's LayerViewer
    integration exposes one): `render()` early-returns without drawing when
    toggled off — cheaper and simpler than repeatedly calling
    `map.addLayer`/`removeLayer`, and avoids re-triggering the glTF load.
  - Opacity: applied by traversing the loaded scene graph and setting
    `material.transparent = true; material.opacity = value` on every mesh's
    material(s) — there's no single top-level "layer opacity" knob in raw
    three.js the way there is for a MapLibre raster paint property.

## 5. Dependencies

- `<Model3D>` (done) — not reused directly (different rendering approach,
  per above), but its sample data (`public/model3d-samples/duck/model.glb`)
  is reused as-is for this epic's sample too.
- `<LayerViewer>` (done) — the integration point.
- Landscape-to-Minecraft (next epic) depends on this epic existing first —
  it reuses the same "3D content composited into the map/terrain" muscle.

## 6. Decisions made without a blocking gate (operator asked to keep moving)

1. Raw three.js custom layer, not r3f — required by MapLibre's rendering
   model, not a style preference.
2. `GeoAnchoredModel` as a new, separate type from `Model3D`'s `ModelDef`.
3. Integration via a `<LayerViewer>` prop extension, not a new top-level
   component.
4. Sample placement: the existing sample parcel's real (rio-tiler test)
   extent, reusing the duck model already sourced for `<Model3D>`.
