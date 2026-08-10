# Land overlay — geo-anchored 3D models on `<LayerViewer>` (hive spec)

> **This is not a new component.** It's a capability extension of
> **`<LayerViewer>`** (see `docs/components/layer-viewer.md`, which this doc
> assumes and cross-references throughout): a new `models?: GeoAnchoredModel[]`
> prop that composites real 3D glTF meshes onto the same georeferenced map
> `<LayerViewer>` already owns, anchored at a real lat/lon so a model reads as
> genuinely "in the land" rather than a flat icon. There is no `<LandOverlay>`
> import — you use `<LayerViewer models={...} />`.

**Design discussion (RESOLVED architecture — read first):**
`.pHive/epics/land-overlay/docs/design-discussion.md` — this doc documents
those decisions, it does not re-derive them.

## Why (operator intent — honor this)

CBA's target pipeline (nadir passes → WebODM → orthomosaic + DSM + point cloud
+ glTF mesh) and CLAUDE.md's 2026-08-07 vision expansion both point at the
same next step after `<Model3D>` shipped the free-floating glTF viewer:
composite that mesh *onto the map*, not just in its own orbiting canvas.
`<Model3D>`'s own doc deliberately deferred inventing a geo-anchoring type
(`ModelDef {id, url, title}` carries no `scale`/`position`/lat-lon — see
`docs/components/model3d.md`'s "Deliberately deferred" section) until an epic
that actually needed it existed. This epic is that epic, and it's also the
confirmed prerequisite for what's queued next (the Minecraft voxelizer /
content-engine work — CLAUDE.md's priority order: Model3D → land overlay →
Minecraft voxelizer → telemetry-driven video overlay), which will reuse the
same "3D content composited into the map" muscle this epic built.

## The type — `GeoAnchoredModel` (`lib/geo-model-types.ts`)

```ts
export interface GeoAnchoredModel {
  id: string;
  url: string;
  title: string;
  lat: number;
  lon: number;
  altitudeMeters?: number;      // default 0 (ground level)
  rotationDegrees?: number;     // yaw about the vertical axis, default 0
  scale?: number;               // multiplier on top of meters-per-glTF-unit, default 1
}
```

This is **deliberately a different shape from `<Model3D>`'s `ModelDef`**, not
a superset or a shared base — `ModelDef` is scene-space (a mesh at the origin
of its own free-floating `<Canvas>`); `GeoAnchoredModel` is geo-space (a mesh
draped onto a real map at a real lat/lon, the same way every entry in
`lib/layer-types.ts`'s `LayerDef` registry is real-world-anchored). Do not
import, extend, or alias one from the other — `lib/geo-model-types.ts`'s own
header comment states this explicitly, and it's asserted by the field-level
diff having no overlap beyond `{id, url, title}`.

`scale` is *not* a raw Mercator-space multiplier. `createModelLayer` already
computes a meters→Mercator-units factor from the anchor's latitude
(`MercatorCoordinate.meterInMercatorCoordinateUnits()`); `scale` sits on top
of that and answers "how many real-world meters should one unit of the
glTF's own coordinate space represent" — i.e. it corrects for a glTF authored
in some arbitrary unit rather than meters. The sample duck (an oversized,
non-metric export — its position-accessor min/max span roughly 165×154×115
raw units) needed `scale: 10` to read as a recognizable, non-speck,
non-frame-swallowing silhouette; that number was arrived at empirically
(Playwright pixel readback at `scale: 0.1`, `5`, `10`, `50`), not guessed —
see `app/(showcase)/components/land-overlay/page.tsx`'s `SAMPLE_MODEL_SCALE`
comment for the full search.

## How the custom-layer engine works (`lib/maplibre-model-layer.ts`)

`<LayerViewer>` doesn't render 3D models itself. `createModelLayer(model:
GeoAnchoredModel): ModelLayer` builds a MapLibre `CustomLayerInterface` — a
layer type where MapLibre hands you its raw WebGL context and calls your own
`onAdd`/`render`/`onRemove` once per frame, instead of MapLibre drawing
anything for you. `LayerViewer.tsx` just calls
`map.addLayer(createModelLayer(model))` / `map.removeLayer(model.id)`, the
same arm's-length way it already wires in `@geomatico/maplibre-cog-protocol`
(see layer-viewer.md's "Tech" section) — it does not reimplement any of this
inline.

**Why raw three.js, not `@react-three/fiber` (unlike `<Model3D>`):** r3f's
`<Canvas>` assumes it owns the render loop and the WebGL context. A MapLibre
custom layer has to render *into* MapLibre's existing loop and context
instead, so this is a genuinely different code path from `<Model3D>`'s r3f
approach, not a style choice — `lib/maplibre-model-layer.ts`'s own header
comment is explicit about this.

**The pipeline, per frame:**

1. **`onAdd(map, gl)`** (called once, synchronously, when the layer is
   added): kicks off a lazy `import("three")` + `GLTFLoader` +
   `maplibre-gl`'s `MercatorCoordinate` (mirrors `LayerViewer.tsx`'s own
   `loadMapLibreModules()` lazy-load pattern — `maplibre-gl` touches
   browser-only globals at module-load time and would crash `next build`'s
   server-side prerender if imported eagerly). Once resolved, it builds a
   `THREE.Scene` + a minimal two-light rig (ambient + one directional — glTF
   PBR materials render solid black with zero scene lights; this was found
   live during the showcase-page story, not anticipated up front), a
   `THREE.Camera` whose `projectionMatrix` is fully overwritten every frame
   (its constructor params are irrelevant), and a `THREE.WebGLRenderer`
   constructed with `{ canvas: map.getCanvas(), context: gl }` — **sharing**
   MapLibre's own GL context rather than owning a separate one, with
   `autoClear = false` so it doesn't wipe what MapLibre already drew this
   frame (the basemap + raster/geojson layers, drawn earlier in the frame).
   It also converts `{lat, lon, altitudeMeters}` to Mercator space via
   `MercatorCoordinate.fromLngLat` and builds the model's object-space →
   Mercator-space transform (`buildModelMatrix`, pure/unit-tested — see
   below), then kicks off `GLTFLoader.load(model.url, ...)`.
2. **`render(gl, matrix)`** (called by MapLibre once per map frame,
   `matrix` = MapLibre's current projection matrix for that frame):
   multiplies MapLibre's matrix by the model's own transform
   (`combineMatrices`, pure), hands the result to the three.js camera as its
   `projectionMatrix`, and calls `renderer.render(scene, camera)`. This one
   multiply is what makes the model automatically track pan/zoom/tilt/bearing
   — MapLibre owns all the camera math every frame; three.js only ever draws
   into the matrix it's handed.
3. **`onRemove()`**: disposes every geometry/material/texture the loaded glTF
   created (three.js does not garbage-collect GPU resources just because a
   reference is dropped) and clears all internal references.

### The five corrections a design review forced into the "naive happy path" recipe

MapLibre's own official custom-layer example is a straight-line happy path —
`onAdd` loads synchronously, `render` always draws, cleanup is an
afterthought. None of that survives a real, ref-counted, remount-tolerant
React component. Every one of these is load-bearing, not defensive
boilerplate — a future maintainer touching this file should not "simplify"
any of them away:

1. **Ready-guard.** `onAdd` is synchronous; loading `three`/`GLTFLoader` and
   fetching/parsing the glTF are both async. `render()` checks `if (!ready)
   return;` **first, before touching anything else** — MapLibre *will* call
   `render()` before the model has loaded on a real map, and without this
   guard that's a null-dereference or a draw call against a half-built scene.
2. **Cancelled-guard.** Checked twice: once before the lazy module import
   resolves, and once — the case that actually matters — before the
   in-flight `GLTFLoader.load()` success callback calls `scene.add()`. Both
   guard against `onRemove()` firing (component unmounts, or the `models`
   prop drops this entry) while an async step is still in flight; without it,
   a load that resolves post-unmount adds a mesh to a scene nobody will ever
   render or dispose again — a leak, not just a wasted draw.
3. **`resetState()` after every `render()`, before returning to MapLibre.**
   three.js's `WebGLRenderer` mutates GL state (depth/blend/cull/viewport) as
   a side effect of `render()`. Left unreset, MapLibre's *own* subsequent
   layer draws — the ortho/hillshade/parcel-boundary raster/geojson layers,
   drawn after this custom layer in z-order — can render corrupted. This is
   the single correction with its own dedicated regression test (see
   "GL-state-pollution regression" below).
4. **Full disposal on `onRemove()`.** Every geometry, material, and texture
   the loaded glTF created gets `.dispose()`'d explicitly — three.js objects
   don't auto-release GPU buffers/textures/programs just because a JS
   reference is dropped. Textures are found via a fixed list of known
   texture-slot property names (`map`, `normalMap`, `roughnessMap`, …) since
   they live as named properties on a material, not in a traversable
   collection.
5. **Scene-graph-wide opacity.** Raw three.js has no single "layer opacity"
   knob the way MapLibre's `raster-opacity` paint property is one number.
   `setOpacity()` walks the whole loaded scene graph and stamps
   `transparent = true; opacity = value` onto every mesh's material(s)
   individually (a mesh may carry one material or an array of them).

Plus **the lighting fix** found live during the showcase-page story (the
duck rendered as a solid black silhouette — position/scale were correct,
only lighting was missing) and **`getMap()`/`isReady()`**, added by the
test-suite story purely so Playwright could reach the live `Map` instance and
wait deterministically for "the model has actually rendered a frame" instead
of guessing with a fixed timeout (see below).

### The pure, unit-tested core vs. the WebGL-dependent shell

`lib/maplibre-model-layer.ts`'s own header comment lays out a "TESTABILITY
MAP" worth repeating here, because it explains why this doc cites two
different kinds of test evidence:

- `buildModelMatrix` / `combineMatrices` / `multiplyMat4` and the
  `make*Mat4` helpers are 100% pure array arithmetic — no three.js, no
  maplibre-gl, no WebGL — fully covered by ordinary Vitest unit tests.
- `applyOpacityToSceneGraph` / `disposeSceneGraph` are pure recursive
  traversals typed against **minimal structural shapes**
  (`Object3DLike`/`DisposableObject3DLike`, not `THREE.Object3D` itself), so
  they're exercised with plain object literals in unit tests, while real
  `THREE.Group`/`Mesh`/`Material` instances satisfy those shapes for free at
  runtime (structural typing) — same functions, no separate "real" version.
- `createModelLayer()`'s own `onAdd`/`render`/`onRemove` control flow (do the
  guards fire in the right order? is `resetState()` actually called? does
  disposal walk the right objects?) is unit-tested by mocking the `"three"`
  and `GLTFLoader` module specifiers with lightweight call-recording fakes —
  this proves the **wiring**, not that the resulting pixels are correct.
  jsdom has no WebGL; a real `new THREE.WebGLRenderer(...)` throws the
  instant it queries a GL context under jsdom, so this file's `npm test`
  coverage stops at wiring by construction, not by oversight.
- Whether the rendered pixels actually land in the right place on screen is
  **Playwright's job exclusively** — see the next section.

## The numeric verification approach actually used

The epic's design discussion was explicit, after adversarial review, that
qualitative "looks roughly right" checking is not sufficient for the hardest
rendering work in the project — a matrix/unit mistake in this code tends to
fail *silently* (nothing renders, or renders at the wrong scale/position)
rather than erroring loudly. `lib/maplibre-model-layer.placement.test.ts`
(run via `npx playwright test`, **not** `npm test` — jsdom has no WebGL) is
where that commitment is honored. Concretely, against the real
`/components/land-overlay` showcase page:

- **Reaching the live map instance.** `page.evaluate` runs in the browser
  with no way to reach into a React ref from outside the component tree, and
  `<LayerViewer>` doesn't otherwise expose its internal `Map`. The showcase
  page stashes its `LayerViewerHandle` ref onto
  `window.__layerViewerHandle` in a `NODE_ENV !== "production"`-gated effect,
  purely for this — `LayerViewerHandle` grew a `getMap()` accessor
  specifically to make that handle useful for this, and `ModelLayer` grew
  `isReady()` so the test can wait for "the model has actually rendered a
  frame" instead of a fixed timeout (`map.getLayer("duck").implementation
  .isReady()`).
- **Reading back real rendered pixels.** `<canvas>.getImageData()` on a WebGL
  canvas only returns real content if the readback happens **synchronously
  inside the map's own `"render"` event callback**, before control returns
  to the browser's event loop/compositor (`<LayerViewer>`'s context isn't
  created with `preserveDrawingBuffer: true`, matching MapLibre's own
  default) — verified live: a `setTimeout`/microtask readback after
  `"render"` reliably came back all-zero/transparent; a synchronous readback
  inside the `"render"` callback reliably captured the real frame. Every
  capture uses `map.once("render", () => { /* synchronous getImageData */
  })` + `map.triggerRepaint()`.
- **Locating the model in the captured frame.** A duck-colored-pixel mask
  (`R - B > 60` per RGBA pixel) isolates the sample duck (the classic
  Khronos "Duck" glTF, yellow-bodied/orange-beaked) from every background
  this scene can show at its anchor coordinates (satellite tiles, Esri's
  "no imagery" placeholder, the sample parcel's green boundary fill) — those
  cluster at `R - B` in roughly `[-15, 35]`; the duck clusters in roughly
  `[140, 255]`. The masked pixels' intensity centroid and bounding box are
  the model's **actual** rendered position.
- **The comparison, at each camera state, is two independent numeric
  checks:**
  1. **Containment** (the story's literal ask): `map.project(lngLat)` of the
     model's real anchor — the **expected** screen position, straight from
     MapLibre's own camera math — must land inside the duck's actual
     rendered bounding box (±20px slop for anti-aliasing/mask-threshold
     edge effects). This holds for *any* correct rigid transform, because
     the anchor is verified (by reading the glTF's own accessor min/max) to
     sit within the mesh's local horizontal footprint.
  2. **Golden-centroid distance** (tighter, more sensitive to
     rotation/axis-sign bugs specifically): the measured centroid must be
     within 15px of a previously-measured reference value for that exact
     camera state — rendering here is fully deterministic, so two
     independent live measurements against known-correct code reproduced
     each golden value to sub-pixel precision.
- **The pitch/bearing sweep is mandatory, not optional.** Both checks above
  run at **pitch 0/bearing 0** (default view) *and* **pitch 45/bearing 90**
  (tilted/rotated) — a matrix bug that cancels out at the default view is a
  real, common failure mode this sweep exists specifically to catch. This
  wasn't just asserted to matter: dropping the fixed glTF-Y-up →
  Mercator-Z-up rotation term from `buildModelMatrix`'s multiply chain was
  deliberately injected during development and re-measured — it shifted the
  golden-centroid distance to ~90–95px at **both** camera states (i.e. it
  does not conveniently cancel out at the default view for this asset),
  comfortably outside the 15px tolerance. The same injected bug is also
  caught more directly by a unit test asserting the Y-axis handedness sign.
- **GL-state-pollution regression** (Correction 3 above, made concrete):
  compares a pixel fingerprint of the ortho layer's own appearance on a
  page that never adds the model layer at all
  (`/components/layer-viewer`, used as ground truth) against the same
  fingerprint on `/components/land-overlay` *after* the model layer has
  rendered at least one frame **and** the ortho layer has been toggled off
  then back on through the real `<LayerControl>`-equivalent imperative-handle
  path (`toggleLayer`). Every sampled pixel must match within a small
  decode/anti-aliasing tolerance (`8` per channel) — zero samples are
  allowed to exceed it. A genuinely separate model-free page is used as the
  "before" state rather than an early-as-possible capture on the same page,
  specifically because the duck's glTF is a small local asset that can load
  fast enough to race an early-page-load capture — a construction-based
  ground truth sidesteps that instead of relying on timing.

## Current limitation — glTF meshes only, no point-cloud overlay

`GeoAnchoredModel`/`createModelLayer` only render glTF/glb meshes via
three.js's `GLTFLoader`. There is no path here for draping a raw point cloud
(COPC/LAZ, potree) onto the map — that's CBA's separate, later
point-cloud-rendering phase, tracked against `<Model3D>` too (see
`docs/components/model3d.md`'s Phase fit: "P3 — point-cloud rendering as an
alternative or companion data source to the glTF mesh path"). Nothing in
`lib/maplibre-model-layer.ts` assumes or blocks a future point-cloud custom
layer being added alongside this one; it just doesn't exist yet.

## Usage

```tsx
import { LayerViewer, LayerControl } from "@/components/LayerViewer";
import type { LayerDef, LayerViewerHandle } from "@/components/LayerViewer";
import type { GeoAnchoredModel } from "@/lib/geo-model-types";

const viewerRef = useRef<LayerViewerHandle>(null);
const [layers, setLayers] = useState<LayerDef[]>([]);

const models: GeoAnchoredModel[] = [
  {
    id: "duck",
    url: "/model3d-samples/duck/model.glb",
    title: "Duck (sample glTF)",
    lat: 73.46748426410694,
    lon: -56.808326092516914,
    altitudeMeters: 0,
    scale: 10,
  },
];

<LayerViewer
  ref={viewerRef}
  manifest="/layer-viewer-samples/2806-prado/layers.json"
  models={models}
  onLayersChange={setLayers}
/>
<LayerControl
  layers={layers}
  onToggle={(id, toggle) => viewerRef.current?.toggleLayer(id, toggle)}
  onOpacityChange={(id, opacity) => viewerRef.current?.setOpacity(id, opacity)}
/>
```

`models` is fully optional and backward-compatible: omitted entirely (every
pre-existing `<LayerViewer>` usage), no model-layer code runs at all —
`createModelLayer` is imported but never called. The prop is diffed by `id`
against what's currently added to the map on every change (an entry added
gets `map.addLayer(createModelLayer(model))`'d, one removed gets
`map.removeLayer(id)`'d, which triggers `onRemove`'s own cleanup).

The showcase demo lives at `/components/land-overlay`
(`app/(showcase)/components/land-overlay/page.tsx`), public/ungated, same as
every other `app/(showcase)/components/*` page — deliberately a separate page
from `/components/layer-viewer`, not a modification of it, since this is a
distinct capability worth its own demo (the same reasoning `<Model3D>` got
its own page rather than being bolted onto `<LayerViewer>`'s).

## Fixed — `@geomatico/maplibre-cog-protocol` misreported WGS84 bounds for non-EPSG:3857 COGs

**Status: fixed (2026-08-08), by reprojecting the sample COGs.** This
section previously documented an open bug; kept here (renamed from "Known
open issue") since the root-cause writeup below is still the reference for
why any future non-3857 sample/real COG would hit the same failure mode.

This bug was **not specific to land-overlay** — it lived in
`<LayerViewer>`'s own COG-loading path (`@geomatico/maplibre-cog-protocol`,
wired in by the layer-viewer epic) and affected `/components/layer-viewer`
too. It was pinned down precisely during this epic's ground-truth placement
work: verifying the sample duck's real-world anchor against `map.project()`
required knowing the sample ortho's *actual* geography, which is when the
mismatch became impossible to miss.

**Root cause:** `@geomatico/maplibre-cog-protocol` v0.4.0 hardcodes a Web
Mercator assumption for every COG it loads — its minified bundle constructs
`new SphericalMercator({size:256, antimeridian:true})` and derives tile
bounds via `bbox(x,y,z,false,"900913")` (the "900913" EPSG:3857 alias),
unconditionally, regardless of the COG's actual embedded CRS. It never reads
the file's real coordinate-reference-system metadata. So a COG whose pixel
grid isn't already in EPSG:3857 has its raw projected-meter values
misinterpreted as if they *were* Web Mercator meters.

`public/layer-viewer-samples/2806-prado/ortho.tif` was a real, valid COG in
**EPSG:32621** (UTM zone 21N) — verified directly with `rasterio`, its true
WGS84 extent is ~**73.47°N, 56.8°W** (high Arctic — matches the sample
duck/parcel coordinates used throughout this epic). Before the fix, the
library's `RasterTileSource.bounds` for this file, live-verified via
`map.getSource("layer-ortho").bounds`, came back as **lon 3.35–5.74 / lat
58.25–59.49** — off the coast of **Norway** — matching the Web Mercator
inverse projection of the COG's raw UTM meter values. The actual tile
fetches shared the same bug, so the ortho imagery itself painted near
Norway, not at the real parcel location.

**The fix:** reprojected both `ortho.tif` and `hillshade.tif` from
EPSG:32621 to EPSG:3857 ahead of time (`rio warp --dst-crs EPSG:3857
--resampling bilinear`, then re-cogged with `rio cogeo create` and validated
with `rio cogeo validate`), rather than patching the library. This sidesteps
the library's hardcoded assumption entirely and matches CLAUDE.md's own
target pipeline, which already tiles/reprojects WebODM output before it
reaches `<LayerViewer>` (target format is PMTiles/COG in a web-safe
projection already). Post-fix, `ortho.tif`'s computed WGS84 bounds are
`[-61.288, 72.230, -52.302, 74.663]` — correctly containing the known
duck/parcel coordinates (lon -56.808, lat 73.467). Both showcase pages
(`/components/layer-viewer`, `/components/land-overlay`) now land on the
correct real-world location by default, with no manual pan/zoom or
`map.jumpTo()` workaround needed.

**Side effect:** `hillshade.tif`'s pixel dimensions shifted from 512×512 to
549×522 and its value range from [78,216] to [0,213] due to bilinear
resampling during reprojection. `public/minecraft-samples/2806-prado/heightmap.json`
(minecraft-content-engine epic) derives from this file, so it was
regenerated in lockstep using the same 32×32 average-pool +
linear-quantize-to-[1,8] approach as originally used — see
`docs/components/voxel-terrain.md` for that derivation's own notes. Both
`public/layer-viewer-samples/2806-prado/manifest.test.ts` and
`public/minecraft-samples/2806-prado/heightmap.test.ts` re-derive/validate
against the actual committed files at test time (not hardcoded CRS/bounds
values), so both continued passing with zero test-file edits.

**Any future real or sample COG that isn't already EPSG:3857 will hit this
identical bug** — reproject ahead of time (as done here) rather than relying
on the library to handle it. If someone wants to fix it at the library layer
instead, the specific code to patch is `@geomatico/maplibre-cog-protocol`'s
`_e=({x,y,z})=>Le.bbox(x,y,z,false,"900913")` (or its equivalent in whatever
version is installed) — it needs to read the COG's actual CRS and reproject
accordingly rather than assuming "900913" unconditionally.

## Phase fit

- **P1 (`<Model3D>`, done):** free-floating glTF mesh viewer, scene-space
  only, no geo-anchoring.
- **P2 (this epic):** `GeoAnchoredModel` + `createModelLayer` + `<LayerViewer>`'s
  `models` prop — a glTF mesh composited onto the real georeferenced map at a
  real lat/lon, numerically verified against `map.project()` across a
  pitch/bearing sweep, with a GL-state-pollution regression guard.
- **P3 (per CBA, not built here):** point-cloud rendering (potree/COPC) as an
  alternative or companion data source to the glTF-mesh path this epic ships.
- **Next (per the operator's 2026-08-07 priority order):** the Minecraft
  voxelizer/content-engine epic reuses this epic's "3D content composited
  into the map" muscle — and, per `.pHive/CONTEXT.md`'s Conventions entry,
  its likely need for its own MapLibre custom layer should follow this
  module's `resetState()`/ready-guard/cancelled-guard pattern rather than
  rediscovering it.

## Real data update (2806 Prado, real georeferenced-fix story)

The underlying `<LayerViewer>` sample data (ortho/hillshade/parcel/contours) was replaced
with the operator's real, rights-cleared 2806 Prado St photogrammetry — see
`docs/components/layer-viewer.md`'s own "Real data update" section for the full
provenance/GPS-bug writeup. The sample duck's anchor moved to the new real parcel's
centroid (~30.262°N/-97.708°W) and `scale`/`DUCK_ZOOM`/the golden-centroid values in
`lib/maplibre-model-layer.placement.test.ts` were all re-verified LIVE against the new
ortho (not blindly copied) — the default-camera golden centroid changed (from
`{345.25, 235.82}` to `{363.32, 221.82}`, deterministic across two independent live runs);
the rotated-camera golden and the R-B>100 duck-color mask both still held unchanged.

The demo model deliberately stayed the duck, not the real reconstructed Prado mesh now
used by `<Model3D>`'s own showcase (`public/model3d-samples/prado/model.glb`): that mesh
is Z-up in its raw ODM/OBJ export, and this component's absolute map-alignment requirement
needs a real axis-correction pass (verified live, same as everything else in this file) —
budget for that as its own follow-up, don't guess at it.

### v2 update

The underlying ortho was replaced again with v2 (nadir + oblique orbit — see
`docs/components/layer-viewer.md`'s "v2 update" section). The duck's anchor and all golden
pixel-centroid values above held unchanged — v2 was cropped to within ~15m of v1's original
extent specifically to keep this placement test valid without re-deriving new goldens, and
that was verified live (re-ran the full e2e placement suite against the v2 ortho, not
assumed). The Z-up mesh/axis-correction follow-up noted above is still open.
