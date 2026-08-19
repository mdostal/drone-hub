# `<LayerViewer>` — georeferenced layer map viewer (hive spec)

> Drape a **georeferenced ortho / thermal** over a **satellite map base**, and let the
> operator **toggle layers on/off with opacity** — visual ortho · thermal · LiDAR
> hillshade/heightmap · contours · parcel boundary. **This layer toggle is the killer
> feature** (see root `CLAUDE.md`). Plug-and-play, importable into any app.

**Update (operator, 2026-08-08):** drone-hub carries no gating of any kind — every
reference below to `middleware.ts`, `lib/gate.ts`, a passcode gate, or the real
`drone.mdostal.com` client platform describes the separate, private `personal-drone`
platform (which pulls this component in), not this repo. `app/properties/[slug]/page.tsx`
(the gated route this doc originally documented) was deleted; the component itself is
demonstrated at the public `/components/layer-viewer` showcase page. Kept as historical
record of the design decisions below, which are otherwise unaffected.

**Design discussion (RESOLVED architecture — read first):**
`.pHive/epics/layer-viewer/docs/design-discussion.md` — this doc documents those
decisions, it does not re-derive them.

## Why (operator intent — honor this)

Hammer Missions (hub.hammermissions.com) is the reference: a drone data viewer where you
drape imagery over a map base and flip layers on and off. Per `CLAUDE.md`, of everything
that reference does, **the layer toggle is called out explicitly as the killer feature** —
not the 3D viewer, not annotation, not compare. `<LayerViewer>` is CLAUDE.md's "the core"
component and CBA's `MapLayerViewer` — the first plug-and-play component the hive kickoff
brief says to ship.

The operator (solo fractional CTO, DJI Mini 5 Pro, no thermal, no RTK) needs this to work
against **real public sample geospatial data now**, proven end-to-end, so that when real
Prado/Omaha nadir-pass data comes back from WebODM it drops in as new manifest entries —
no rework. (The Phase-0 nadir-grid-pass blocker only blocks *real* data; it never blocked
building and testing the components — see CLAUDE.md's 2026-08-07 correction and
design-discussion.md §0.)

## The model — a typed layer registry

See `lib/layer-types.ts` (built by a concurrent story in this same epic — see note below).
CBA's plug-and-play framing: `MapLayerViewer` is "MapLibre driven by a typed layer
registry `{id,type,url,opacity,toggle}`."

The registry's resolved shape (design-discussion.md §2.1), reproduced verbatim:

```ts
interface LayerDef {
  id: string;
  type: 'raster' | 'geojson';
  url: string | null;
  opacity: number;
  toggle: boolean;
  disabled?: boolean;
  legend?: string;
  format?: 'cog' | 'xyz'; // raster only, defaults to 'cog'
  style?: LayerStyle; // geojson only, added by layerviewer-sample-dataset-overhaul — see below
}

interface LayerStyle {
  fillColor?: string;
  lineColor?: string;
  lineOnly?: boolean; // true → line only, no fill (e.g. contours)
}

interface PropertyLayers {
  slug: string;
  title: string;
  layers: LayerDef[];
}
```

**`style` (added 2026-08-08, `layerviewer-sample-dataset-overhaul`):** an optional,
purely-additive visual-style override for `type: 'geojson'` layers, consumed by
`buildLayerMapConfig` (`components/LayerViewer/LayerViewer.tsx`). Omitted (the case for
every `LayerDef` written before this field existed — all 5 showcase pages,
`lib/layer-types.test.ts`, `LayerViewer.test.tsx`'s fixtures) falls through to the exact
same hardcoded green `#22c55e` fill+line treatment this function always used — confirmed
directly by re-running those existing suites unmodified after the field landed, not just
assumed from "optional fields are additive" in the abstract. `lineOnly: true` renders only
the line layer (no fill at all) — used by the new `contours` layer below so it reads as
thin elevation-contour lines, not a filled area like the parcel boundary.

Key points, resolved by design-discussion.md and grill, not re-derived here:

- `type` is exactly `'raster' | 'geojson'` — **not** a divergent `'raster-cog'` /
  `'raster-tiles'` split. This matches CBA's own thermal-stub example literally.
- Raster layers additionally carry `format?: 'cog' | 'xyz'` (default `'cog'`), so
  `<LayerViewer>` knows which MapLibre source builder to use. Ortho and hillshade layers
  in this epic are `raster` + `cog`.
- `url` is `string | null`. `null` is valid and expected for a `disabled: true` stub (the
  thermal slot — no data exists yet, so there's nothing to hold a URL).
- The satellite basemap itself is **not** a registry entry — it's the map's base, handled
  separately from the layer list.
- `PropertyLayers` (`{slug, title, layers}`) is the per-property manifest, analogous to
  `video-tour`'s `Tour` type — one manifest per property, folder-per-property convention
  (`public/layer-viewer-samples/<slug>/` for this epic's sample data).

### Sample data provenance (`public/layer-viewer-samples/2806-prado/`)

Not real 2806 Prado data — the Phase-0 nadir-pass blocker still applies to real imagery.

**Updated 2026-08-08 (`layerviewer-sample-dataset-overhaul`): the entire sample dataset
was replaced, together, as one coherent regenerate.** The original `ortho.tif` (below,
kept as historical record) turned out to be a **single-band uint16** rio-tiler test
fixture, not real RGB imagery — MapLibre drew it with no stretch/normalization, producing
a near-solid-black shape on both `/components/layer-viewer` and `/components/land-overlay`
(confirmed live via Playwright screenshot). Separately, the original `hillshade.tif` was
continental-scale (~1823 m/pixel over a ~1,000km × 950km extent) while `parcel.geojson`'s
rectangle was ~120m × 100m — about 1/15th of a *single* hillshade pixel — making it
unusable as a source for parcel-scale thermal/contours layers. Rather than patch either
file in isolation (which would leave the ortho/hillshade/boundary/duck registered to
different locations or scales), every layer was regenerated together at ONE new, real,
small-scale location:

- **`ortho.tif`** — **real**, a genuine 3-band RGB drone orthophoto: a crop of
  ["Strata Solar entrance (June 25, 2021)"](https://map.openaerialmap.org/), captured with
  a DJI Mini 2 (the same DJI Mini product line as the operator's own Mini 5 Pro),
  originally published on [OpenAerialMap](https://openaerialmap.org/) under
  **CC-BY 4.0** (attribution: "Designing on a juicy cup", via OpenAerialMap). Downloaded
  from OpenAerialMap's public S3 bucket
  (`s3://oin-hotosm/60d664d2c700c600080d5529/0/60d664d2c700c600080d552a.tif`, original
  EPSG:32617/UTM zone 17N, ~1cm/pixel, 9858×14500px), cropped to a ~48m × 59m interior
  window clear of the source flight-footprint's ragged edges (a paved road, trees, and a
  graded dirt/gravel field — genuinely recognizable aerial imagery, not survey-grade or
  property-specific), downsampled, then reprojected to EPSG:3857 (`rio warp --dst-crs
  EPSG:3857 --resampling bilinear`) and re-cogged (`rio cogeo create` + `rio cogeo
  validate`) — the same established convention as the original ortho's own later
  reprojection (see `docs/components/land-overlay.md`'s "Fixed" section). The crop's real
  WGS84 extent is `[-81.2683, 33.3503, -81.2680, 33.3509]` (near Charlotte, NC/SC —
  **not** 2806 Prado or Omaha; per this story's own instructions, wherever the real
  sourced imagery naturally falls becomes the new sample location, rather than forcing it
  to match a fictional address).
- **`hillshade.tif`** — **synthetic**, regenerated at the ortho's exact new extent/CRS/
  pixel grid (not reused from the old continental-scale file): a procedural elevation
  field (gradient + ridge sinusoid + smoothed noise via `rasterio`/`numpy`/`scipy`),
  rendered through a real slope/aspect hillshade formula (illumination from
  azimuth 315°/altitude 45°, a standard GIS convention), single-band uint8, COG'd via
  `rio-cogeo`. Still **not** real elevation/LiDAR data — flagged via
  `legend: "synthetic placeholder — not real elevation data"`.
- **`thermal.tif`** — **new, synthetic**, an INDEPENDENTLY-VARIED procedural intensity
  field (a separate gradient+noise pass, deliberately NOT derived from the same array
  `hillshade.tif` uses — sharing one source would make toggling between them trace
  identical terrain under different palettes), LUT-mapped through an ironbow colormap
  (black → purple → red → orange → yellow → white) into a 3-band RGB uint8 COG at the
  same extent. `layers.json`'s `thermal` entry is now **live** (`disabled` removed,
  `url: "thermal.tif"`), `toggle: false` by default, legend
  `"synthetic placeholder — not real radiometric data"` (same wording convention as
  `hillshade.tif`'s, adapted for radiometric data).
- **`contours.geojson`** — **new**, real contour lines derived from `hillshade.tif`'s own
  underlying elevation field (`skimage.measure.find_contours` at 6 elevation levels,
  simplified via `skimage.measure.approximate_polygon`, pixel coordinates converted
  through the COG's real affine transform to WGS84 lon/lat), as a GeoJSON
  `FeatureCollection` of `LineString` features. Rendered via the new `style: { lineColor:
  "#38bdf8", lineOnly: true }` (see `style` above) — thin accent-colored lines, no fill,
  visually distinct from the boundary's green fill+line. Legend
  `"synthetic placeholder — not real elevation data"` (derived from the synthetic DEM
  above, not real elevation data). `scikit-image` was used as a one-time data-prep tool
  (`pip install scikit-image`, not a runtime npm dependency, not committed) — matches this
  repo's established "pipeline tools live outside the bundle" pattern.
- **`parcel.geojson`** — **synthetic placeholder**, re-anchored to the new ortho's real
  extent (a rectangle covering ~90% of `ortho.tif`'s WGS84 bounds, centered on it). Still
  not tied to any real address or parcel record — flagged via `properties.placeholder:
  true` and a `properties.note` in the GeoJSON itself.

`app/(showcase)/components/land-overlay/page.tsx`'s sample duck anchor moved to the new
parcel's centroid (`lat: 33.350613554313604, lon: -81.2681617934123`) as a required
cascading change — CLAUDE.md's own "#1 registration gate" (boundary + ortho + model all
register to one grid) would otherwise break.

---

**Historical record — the ORIGINAL sample data (superseded 2026-08-08 above, kept for
context):**

- `ortho.tif` was downloaded verbatim from rio-tiler's own test-fixture COG
  (`tests/fixtures/cog.tif` in `cogeotiff/rio-tiler`) — a genuine, valid, tiled/overview'd
  COG, but **single-band uint16**, not real RGB imagery, and its footprint fell in the
  high Arctic (rio-tiler's synthetic test data), not anywhere near a real property.
  Reprojected from EPSG:32621 to EPSG:3857 on 2026-08-08 to fix a
  `@geomatico/maplibre-cog-protocol` bounds bug — see
  `docs/components/land-overlay.md`'s "Fixed" section — but the single-band-uint16 defect
  (the actual cause of the near-black render) was only fixed by this section's full
  replacement above.
- `hillshade.tif` (original) was continental-scale (~1823 m/pixel), also superseded above.
- `parcel.geojson` (original) was a ~120m × 100m rectangle at the old Arctic location.

**CBA's canonical thermal-stub example** (this WAS the shape of every thermal entry
before a radiometric-adjacent synthetic layer existed; kept as historical record — the
real sample manifest's `thermal` entry no longer matches this shape, see above):

```
type:'raster', legend:'ironbow', disabled:true, url:null
```

**Sync check (docs-acceptance-closeout story, pre-2026-08-08):** diffed field-by-field
against the landed `lib/layer-types.ts`. No drift at the time — `LayerDef` and
`PropertyLayers` above matched the shipped interfaces exactly. The CBA thermal-stub
example above also matched the sample manifest's `thermal` entry byte-for-byte at the
time, asserted verbatim in `public/layer-viewer-samples/2806-prado/manifest.test.ts`'s
"matches CBA's exact thermal stub shape" spec — **that spec was rewritten by
`layerviewer-sample-dataset-overhaul`** (thermal is now live, not a stub) to assert the
new shape instead; see that file directly for the current assertions.

## Behavior

1. **Map renders.** `<LayerViewer>` mounts a MapLibre GL map with the **Esri World
   Imagery** satellite basemap (free, no token) as the base layer — always present,
   never part of the registry.
2. **Each non-disabled `LayerDef` becomes a MapLibre source/layer:**
   - `type: 'raster'` (`format: 'cog'`, the case this epic exercises) → added via
     `@geomatico/maplibre-cog-protocol`, which registers a `cog://` protocol MapLibre can
     source a raster layer from directly.
   - `type: 'geojson'` → added as a plain MapLibre `geojson` source + a matching
     fill/line layer (e.g. the parcel boundary).
   - Initial visibility and paint opacity come from the registry's `toggle` and
     `opacity` fields.
3. **`disabled: true` entries get NO map source/layer at all** — `<LayerViewer>`
   explicitly skips the add-source/add-layer step for them (there is no data to render).
   This is the thermal-stub behavior: the entry exists in the registry and renders as an
   inert row in `<LayerControl>` (greyed out, toggle non-functional), but nothing is
   added to the map. Not a "layer with opacity 0" — genuinely absent from the map's
   source list.
4. **`<LayerControl>`** renders one row per `LayerDef` (a shadcn toggle + opacity slider
   per CBA) — including disabled entries, which render greyed-out and inert rather than
   being omitted from the list. This is the visible "killer feature" UI: flipping a
   toggle or dragging an opacity slider updates the corresponding MapLibre layer's
   `visibility`/`opacity` paint property live. Toggling/opacity has no effect on a
   disabled entry's row (there's no underlying map layer for it to control).

## Tech

- **MapLibre GL** — the map engine (already a dep, `maplibre-gl`).
- **`@geomatico/maplibre-cog-protocol`** — COG raster source builder (already a dep,
  locked in `package.json`, unused before this epic — its first real exercise).
- **Plain MapLibre `geojson` source** — for boundary/vector layers, no extra dep.
- **Esri World Imagery** — the satellite basemap, free, no token required.
- **`next/dynamic({ ssr: false })`** — `<LayerViewer>` is a heavy client-only viewer like
  every other viewer in this stack; it must not attempt to render on the server.
- Not used by this epic despite being locked in `package.json`: `pmtiles` (CBA's target
  pipeline tiles to PMTiles for large datasets; this epic's sample/real COGs are small
  enough that the raw-COG path via `maplibre-cog-protocol` is the right fit — PMTiles
  isn't rejected, just not needed at this data scale yet), `@turf/turf` and `terra-draw`
  (Measure/Annotate, Phase 2).

## Phase 2 tools — Measure · Annotate · Compare · Align

**Shipped 2026-08-18 (`layerviewer-phase2-tools` epic).** CBA's Phase 2 line item —
`MeasureTool` + `AnnotationLayer` + `CompareSwipe` + `AlignControl` — landed as four
stories on `feat/layerviewer-phase2-tools`, closed out by this doc update + the live
showcase wiring + the Measure/Annotate integration check below. This supersedes the
"Acceptance criteria" section's older "Measure, Annotate, Compare, Align ... explicitly
out of scope" framing — see that section's own updated header line.

Two different composition shapes, deliberately:

- **Measure and Annotate live INSIDE `<LayerViewer>` itself** — their own state
  (`measureMode`/`measurePoints`, `annotationMode`/`annotations`), their own floating
  panels, their own MapLibre sources/layers, all added directly in `LayerViewer.tsx`.
  Reason: both need to intercept clicks on `<LayerViewer>`'s OWN map, and both are
  small enough (a GeoJSON source + two layers; one `TerraDraw` instance) that a
  separate sibling component wouldn't buy any real independence — a consumer can't
  meaningfully mount one without the other's map anyway.
- **Compare and Align are SEPARATE sibling components** (`<CompareSwipe>`,
  `<AlignControl>`), same "independent, plug-and-play sibling positioned by the
  consumer" pattern `<LayerControl>` already established (see this doc's "Behavior"
  section / `index.ts`'s wiring comment). Reason: both own a SECOND, independently
  camera-synced MapLibre `Map` instance of their own (a comparison pane, a "ghost"
  pane) — real, separate pieces of chrome a consumer may or may not want mounted,
  not something `<LayerViewer>`'s own click-handling needs to know about at all.

### Measure — `measureMode`/`measurePoints` (built into `<LayerViewer>`)

Click-to-measure real-world distance, via `@turf/turf`'s `distance()` (haversine over a
mean-Earth-radius — a visual tool, not a survey instrument, matching CLAUDE.md's "visual
property-intelligence, NOT survey-grade" framing everywhere else in this doc). A
bottom-left floating panel toggles Measure on/off; while on, the first two map clicks
place points (rendered via a shared GeoJSON source/circle+line layer pair,
`MEASURE_SOURCE_ID`), and a floating label — positioned via `map.project()`, re-computed
on every `move` so it tracks pan/zoom — shows the live great-circle distance
(`formatMeasureDistance`: meters under 1km, km at/above). A third click clears the old
measurement and starts fresh at the new point; an explicit "Clear measurement" action is
also available. Mirrors `<Model3D>`'s own measure tool (`components/Model3D/Model3D.tsx`)
pixel-for-pixel in UX and accent color (`#e8590c`) for cross-component consistency.
Toggling Measure off leaves any already-placed points on the map (only new placement
stops) — same "off means stop interacting, not erase" semantics as Annotate below.

Pure math (`measureDistanceMeters`, `formatMeasureDistance`,
`buildMeasureFeatureCollection`) is exported and unit-tested independently of any
MapLibre instance — see `LayerViewer.test.tsx`. The click-to-place wiring itself is a
full-render suite, `LayerViewer.measure.test.tsx` (real `maplibre-gl` mocked, per this
doc's "Tech" section's `next/dynamic({ssr:false})` note — `maplibre-gl` needs `Worker`,
which jsdom doesn't implement).

### Annotate — `annotationMode`/`annotations` (built into `<LayerViewer>`)

Draw point/line/polygon/freehand annotations directly on the map, via `terra-draw` +
`terra-draw-maplibre-gl-adapter` — the real, separate "buy compute, own the viewer" npm
package this doc's "Stack / plugins" precedent (CLAUDE.md) calls for, hooked onto
`<LayerViewer>`'s ALREADY-EXISTING `Map` instance (not a second map of its own — contrast
with Compare/Align below). A top-left floating panel offers a four-button mode-switcher
toolbar (Point/Line/Polygon/Freehand) plus a legend list of placed annotations with a
per-row Delete action. Clicking a mode button switches terra-draw into it; clicking the
already-active one returns terra-draw to its own built-in idle `TerraDrawRenderMode`
(placed shapes still render, but no new interaction starts) — the map ALWAYS has a valid
active terra-draw mode (required by terra-draw) without that mode ever being a drawing
one while the toolbar shows nothing selected.

terra-draw's own store is the single source of truth for placed features — every
create/update/delete re-reads `draw.getSnapshot()` on its `"change"` event rather than
diffing the event payload, so the legend panel and `onAnnotationsChange` callback (plain
GeoJSON features, not terra-draw-specific types — this repo has no backend of its own,
CLAUDE.md, so persistence is entirely a consuming app's job) stay correct regardless of
which internal terra-draw codepath caused the change. Unmounting calls `draw.stop()`
(triggers the adapter's own `unregister()`, removing its `td-*` sources/layers), not just
dropping the JS reference — same cleanup rigor the model-layer diffing already uses
elsewhere in `LayerViewer.tsx`.

Full-render suite: `LayerViewer.annotate.test.tsx`. terra-draw's real pointer-driven
drawing internals are mocked out (not reproducible/relevant under jsdom — see that file's
header comment) — this suite verifies `<LayerViewer>`'s OWN wiring around it (does a
toolbar click call `setMode()` correctly, does a `"change"` event update the legend +
fire the callback, does Delete call `removeFeatures()`), not terra-draw's own internals.

**Measure/Annotate click-ownership — the required integration check (not assumed):**
both tools want to own a map click when active. Researched directly (not guessed): terra-
draw-maplibre-gl-adapter attaches its OWN native pointer listeners straight to the map's
canvas element (`getMapEventElement()` returns `this._map.getCanvas()` — verified against
the installed package's compiled dist, not just its `.d.ts`), completely independently of
MapLibre's synthetic `map.on("click", ...)` event system that Measure's own click handler
is registered on. Before the `layerviewer-phase2-closeout` fix, a single physical click
with Measure on AND an annotation drawing mode active was consumed by BOTH mechanisms at
once — a measure point placed AND (in a real browser) a terra-draw vertex drawn from the
same click. Confirmed as a real, reproducible conflict (a failing test, not a hypothetical
written in prose) before being fixed two ways, belt-and-suspenders:

1. **UI-level mutual exclusion.** Turning Measure on while an annotation drawing mode is
   active returns terra-draw to idle and clears the toolbar's selection first; switching
   to an annotation drawing mode while Measure is on turns Measure off first. The two
   tools can never both be "on" via their own panel buttons.
2. **Defense-in-depth in the click handler itself.** `<LayerViewer>`'s map `"click"`
   listener gates on `!measureModeRef.current || annotationModeRef.current` — Annotate
   always takes priority over Measure even if some future code path left both flags set
   simultaneously, so Measure never double-handles a click Annotate is (in a real
   browser) about to consume.

Regression-covered by `LayerViewer.tool-exclusivity.test.tsx`, which fails without the
fix (re-confirmed directly by reverting the fix and re-running that suite, not just
assumed from reading the code) and passes with it: activating one tool turns the other
off (both directions), and a click while both would otherwise be eligible only ever
reaches one tool's state.

### Compare — `<CompareSwipe>` (separate sibling component)

A draggable vertical divider comparing two already-registered layers side by side.
Researched directly against real MapLibre-ecosystem precedent before building (see
`CompareSwipe.tsx`'s own header comment for the full trail): MapLibre GL has no paint/
filter/mask primitive that clips one layer to a screen-space rectangle — every real
implementation of this pattern (`@maplibre/maplibre-gl-compare`, `maplibre-gl-swipe`)
reaches for a SECOND `Map` instance clipped via CSS `clip-path`, camera-mirrored from the
first. `<CompareSwipe>` follows the same technique, scoped to fit this component family
specifically: it owns exactly two of its OWN small `Map` instances (not "before/after,
whole scene" the way the precedents are) — one rendering only `layerA` + the shared Esri
basemap, one rendering only `layerB` + the same basemap, both built via the exact same
`buildLayerMapConfig` the main `<LayerViewer>` map uses (so a compared layer renders
identically to its real-map appearance). The right/`layerB` pane sits on top and is the
one CSS-`clip-path`-ed to the divider position; the left/`layerA` pane underneath is
always full-bleed, which is what makes both the 0% and 100% divider positions render
exactly one layer edge-to-edge with no blank strip or seam.

Camera is mirrored ONE-DIRECTIONALLY from the real `<LayerViewer>` map (read via
`viewerRef.current.getMap()`, the same ref a consumer already passes to `<LayerViewer>`)
on every `"move"` — both panes are `interactive: false` with `pointer-events: none` on
their DOM except the divider handle, so all real panning/zooming still happens on the
actual map underneath. `<CompareSwipe>` never calls `setLayoutProperty`/`setPaintProperty`
on `<LayerViewer>`'s own map — a consumer "turns Compare off" by simply not rendering it,
which tears down only `<CompareSwipe>`'s own two extra `Map` instances, leaving nothing to
restore on the real map. The divider itself supports drag (Pointer Events, unified mouse/
touch/pen) and keyboard (arrow keys ±2%, Shift+arrow ±10%, Home/End to the extremes),
`role="slider"` with the live position as `aria-valuenow`.

Full-render suite: `CompareSwipe.test.tsx` (a minimal fake `LayerViewerHandle` — just
`getMap()` — since `<CompareSwipe>` never touches terra-draw/the model-layer engine at
all, unlike `<LayerViewer>`'s own suites).

### Align — `<AlignControl>` (separate sibling component)

A manual GPS-drift alignment nudge — CLAUDE.md's Phase-0 "no RTK = 1-3m drift" problem,
solved directly rather than deferred. Researched directly against this repo's own
installed `maplibre-gl` style spec (`node_modules/@maplibre/maplibre-gl-style-spec/src/
reference/v8.json`, not assumed/remembered) before building: `paint_raster` has no
`raster-translate` property (unlike `paint_fill`/`paint_line`, which DO have `fill-
translate`/`line-translate` — but those only exist for geojson layer types, and the real
drift problem is specifically about raster ortho/hillshade/thermal imagery). MapLibre GL
has no native per-layer positional-offset mechanism for raster layers at all, full stop —
a real, well-known limitation matching the public "add a georeferenced image" workaround
every MapLibre/Mapbox write-up on this reaches for (a separate `image`/canvas source,
not available here without abandoning tiled COG rendering).

`<AlignControl>` reuses `<CompareSwipe>`'s own "second, independently-cameraed `Map`
instance" technique instead: a single small "ghost" pane, rendering ONLY the currently-
selected layer (via the same shared `buildLayerMapConfig`), camera-mirrored from the real
map on every move EXCEPT its center is shifted by the NEGATIVE of the desired offset — so
content geographically at the ghost map's center renders on screen exactly `offsetMeters`
away from where it sits on the real map (`computeGhostCenter`, numerically verified in
`AlignControl.test.tsx`, including that a north-nudge shifts the ghost camera SOUTH, not
north). The real map's own copy of the selected layer is hidden (`visibility: none`, via
`buildLayerMapConfig`'s own computed layer ids) for as long as its offset is non-zero, and
restored the moment the offset returns to zero, the selection changes, or the component
unmounts — via the exported `updateLayerOnMap`, which respects the registry's own current
`toggle`/`opacity` rather than hardcoding visible, so this never fights a sibling
`<LayerControl>`.

A bottom-right panel offers a layer selector (every non-disabled entry with a real `url`),
a 4-direction D-pad nudging the selection by `ALIGN_STEP_METERS` (0.25m per click — small
enough that correcting 1-3m of real-world drift takes a handful of clicks, not one
imprecise jump), a live `north/east` meters readout, and a Reset action. Offsets are
tracked per-layer (`Record<string, AlignOffset>`) — switching the selector back to a
previously-nudged layer restores its own accumulated offset, not zero. `onAlignmentChange`
fires the current cumulative offset on every nudge/Reset — same "the viewer doesn't own
persistence it shouldn't" escape-hatch pattern as `<LayerViewer>`'s own
`onAnnotationsChange`/`onLayersChange`.

Full-render suite: `AlignControl.test.tsx`, in two tiers — pure numeric checks
(`metersToLngLatOffset`/`computeGhostCenter`/`nudgeOffset`/`isZeroOffset`, no React or
MapLibre at all) first, then full-render specs against a fake `Map` (mirrors
`CompareSwipe.test.tsx`'s harness, extended since `<AlignControl>` — unlike
`<CompareSwipe>` — also mutates the real map's own layer visibility, not just reads its
camera).

## The gated-route convention

`<LayerViewer>` mounts at `/properties/[slug]`, extending the same gating pattern
`video-tour` shipped for `/tours/[slug]`:

- `middleware.ts`'s matcher is extended to also cover `/properties/*`.
- `lib/gate.ts` provides the same cookie-based, fails-closed passcode gate.
- The route mounts `<LayerViewer>` via `next/dynamic({ ssr: false })`, same as
  `video-tour`'s heavy-player convention.

**Generalization required, not a copy-paste:** `lib/gate.ts`'s `sanitizeNextPath`
hardcoded `next.startsWith("/tours")`, falling back to `/tours` for anything else. Left
as-is, a `/properties/[slug]` passcode redirect would silently bounce the user to
`/tours` instead of back to their property. This epic generalizes `sanitizeNextPath` to
accept any gated prefix (checked against the same prefix list the middleware matcher
uses), not just add `/properties` on top of the old hardcoded check.

### Known limitation — flagged, not solved

Gating stays **one global passcode/cookie for the whole app**, covering both `/tours/*`
and `/properties/*`. `CLAUDE.md`'s phrasing ("until Mathew explicitly flips a given
tour/dataset public") implies **per-dataset** control — this implementation does **not**
provide that; every gated property and tour shares one switch. This is acceptable for now
(it matches what `video-tour` already shipped, and there is exactly one operator), but is
a real gap if this ever needs to share different properties with different people (e.g. a
client who should only see their own property). Documented here explicitly so it isn't
rediscovered as a surprise later — not silently passed through as if it were solved.

## Acceptance criteria

Scoped to this epic (P1: `<LayerViewer>` + `<LayerControl>` on sample data) only.
`<Model3D>` is a separate epic, out of scope here — see Phase fit. **Measure, Annotate,
Compare, and Align were originally scoped OUT of this P1 checklist ("explicitly out of
scope — see Phase fit") — that framing is now superseded: all four shipped as the
`layerviewer-phase2-tools` epic (see "Phase 2 tools" above) and are proven against this
same sample dataset at the live `/components/layer-viewer` showcase. The checklist below
is kept as-is (P1's own original scope), not rewritten to claim it always covered Phase 2.

- [x] Renders a MapLibre GL map with the Esri World Imagery satellite basemap as the base
      layer, independent of the layer registry.
  Verified: `LayerViewer.tsx`'s map-creation effect constructs the MapLibre `Map` with the
  Esri World Imagery raster source/layer (`ESRI_WORLD_IMAGERY_URL`, `BASEMAP_SOURCE_ID`/
  `BASEMAP_LAYER_ID`) unconditionally — before any registry layer is added, and regardless
  of whether `layers` is empty.
- [x] Loads a `PropertyLayers` manifest and renders each non-disabled `LayerDef` as a
      MapLibre source/layer: `raster`/`cog` via `@geomatico/maplibre-cog-protocol`,
      `geojson` via a plain MapLibre geojson source.
  Verified: `resolveManifest()` fetches-or-passes-through the manifest; `loadMapLibreModules()`
  registers the `cog://` protocol via `maplibregl.addProtocol("cog", cogModule.cogProtocol)`
  from `@geomatico/maplibre-cog-protocol`; `buildLayerMapConfig()`/`addLayerToMap()` build a
  `cog://`-prefixed raster source for `raster`/`cog` layers and a plain
  `{type:"geojson", data:url}` source + fill/line layer pair for `geojson` layers. Unit-covered
  by `LayerViewer.test.tsx`'s `buildLayerMapConfig` cases (raster+cog, raster+xyz, geojson);
  live-verified end-to-end against the real Prado manifest in the core-components story's
  Playwright pass (all four manifest layers — ortho, hillshade, boundary, thermal — loaded).
- [x] `disabled: true` entries (the thermal stub) add no MapLibre source/layer, but do
      render an inert, greyed-out row in `<LayerControl>`.
  Verified: `buildLayerMapConfig()` returns `null` for `disabled: true` (unit-tested); the
  `map.on("load")` handler explicitly `continue`s past disabled layers before ever calling
  `addLayerToMap`, so `map.addSource`/`addLayer` never runs for them. `LayerControl.tsx`
  still renders their row (`opacity-40`, `aria-disabled="true"`, disabled checkbox + slider,
  unfocusable) — covered by `LayerControl.test.tsx`'s disabled-row tests.
- [x] `<LayerControl>` renders one row per `LayerDef` with a toggle and an opacity slider;
      toggling/opacity changes are reflected live on the map for non-disabled layers.
  Verified: `LayerControl.tsx` renders one toggle+slider row per layer, in manifest order
  (`LayerControl.test.tsx`). The live-map-update half of this (`toggleLayer`/`setOpacity` on
  `LayerViewerHandle` → state update → `updateLayerOnMap` → `setLayoutProperty`/
  `setPaintProperty`) can't run under jsdom (`maplibre-gl` needs the `Worker` global, which
  jsdom doesn't implement — see `LayerViewer.test.tsx`'s header comment), so it was verified
  live instead: the core-components story's Playwright pass against a real
  `next build && next start` server clicked the hillshade toggle (unchecked → checked) and
  dragged the ortho opacity slider (→ 0.4), confirming both round-trips actually repaint the
  map. Real but manual verification, not automated regression coverage — a gap worth noting,
  not hiding.
- [x] Ships against real public sample data (a real COG ortho, a synthetic hillshade/DEM
      COG, and a synthetic parcel-boundary GeoJSON) under
      `public/layer-viewer-samples/<slug>/` — not mocks.
  Wording corrected: the original phrasing read as if the hillshade were real sample data
  alongside the ortho; it is a **synthetic placeholder**, not real elevation/LiDAR data —
  see "Sample data provenance" above, which this bullet now matches. Verified: all three
  files exist under `public/layer-viewer-samples/2806-prado/` as real files (not mocked in
  code) and are validated by `public/layer-viewer-samples/2806-prado/manifest.test.ts`
  (TIFF magic bytes, `rio-cogeo` strict COG validation when available, GeoJSON
  polygon well-formedness) — re-confirmed directly during this closeout pass (`rasterio`:
  both COGs share `EPSG:32621` and an identical bounding box; `ortho.tif` is single-band
  `uint16`, `hillshade.tif` single-band `uint8`, matching the provenance notes).
  **Update, 2026-08-08:** both COGs were subsequently reprojected to `EPSG:3857` to fix
  a bounds-misreporting bug — see the "Fixed" section this doc points to above. The
  `EPSG:32621` CRS this checklist entry verified is no longer current; the bounding box
  and hillshade pixel dimensions/value range also changed as a result. Re-verify against
  the live files if precise CRS/extent numbers matter for future work.
  **Update, 2026-08-08 (`layerviewer-sample-dataset-overhaul`):** the sample dataset is
  now FIVE files, not three — `ortho.tif` (real, replacing the single-band-uint16
  fixture), `hillshade.tif` (regenerated at the new extent), `thermal.tif` (new, live),
  `contours.geojson` (new), and `parcel.geojson` (re-anchored) — all at one new,
  internally-consistent real location. See "Sample data provenance" above for the current
  source/license of each file; this bullet's older verification details above are
  superseded.
- [x] Mounted at a gated route, `/properties/[slug]`, via `next/dynamic({ ssr: false })`,
      behind the same passcode gate as `/tours/[slug]` (`middleware.ts` + `lib/gate.ts`,
      with `sanitizeNextPath` generalized to handle both prefixes correctly).
  Verified: `app/properties/[slug]/page.tsx` loads `<LayerViewer>` via
  `dynamic(..., { ssr: false })`; `middleware.ts`'s `config.matcher` includes
  `/properties/:path*` (with a dev-time drift guard against `lib/gate.ts`'s
  `GATED_PATH_MATCHERS`); `lib/gate.ts`'s `sanitizeNextPath` is generalized over
  `GATED_PATH_PREFIXES = ["/tours", "/properties"]` rather than hardcoding `/tours`.
  Live-verified: no cookie → 307 to `/enter-passcode?next=%2Fproperties%2F2806-prado`;
  correct passcode submitted through the real form → lands back on the property page with
  the layers rendered.
- [x] Importable standalone into personal-site: `<LayerViewer>`/`<LayerControl>` and
      everything they transitively import carry no dependency on `app/`, `middleware.ts`,
      or `lib/gate.ts`.
  Verified — see "Importable standalone — audit finding" below.
- [x] Passes `npm run build`.
  Verified: clean `npm run build` (Next.js 15.5.23), `/properties/[slug]` present as a
  dynamic route in the output. Re-verified after this closeout story deleted the now-
  redundant `app/dev-preview-layers/` throwaway route (superseded by the real
  `/properties/[slug]` route — confirmed via repo-wide grep that nothing else referenced
  it first): build and `npm test` (92/92 passing, 11 test files, spanning both the
  `video-tour` and `layer-viewer` epics with no regressions) both stayed green.

### Importable standalone — audit finding

Walked `components/LayerViewer/index.ts`'s full export surface (`LayerViewer`,
`LayerControl`, plus the re-exported `lib/layer-types.ts` types) and every file it
transitively imports: `LayerViewer.tsx`, `LayerControl.tsx`, `cx.ts`, `lib/layer-types.ts`,
plus the lazily-`import()`ed `maplibre-gl` and `@geomatico/maplibre-cog-protocol` npm
packages. Clean: nothing pulls from `app/`, `middleware.ts`, or `lib/gate.ts`.
`index.ts`'s own header comment documents this as the intended contract ("copy this folder
into a standalone consumer like personal-site — everything it transitively imports is
scoped to this folder + lib/layer-types.ts, no app/ or gating deps") and the code matches
the claim. `app/properties/[slug]/page.tsx` is a one-way consumer of this family (imports
*from* `components/LayerViewer`, not the reverse) and itself carries zero gating logic —
gating is enforced upstream by `middleware.ts`. The "plug-and-play" bar from `CLAUDE.md`
holds.

## Phase fit

- **P1 (this epic):** `<LayerViewer>` + `<LayerControl>` on the typed layer registry,
  proven against real public sample data (sample COG ortho, hillshade/DEM, synthetic
  parcel boundary), mounted at a gated `/properties/[slug]` route. The thermal slot exists
  in the registry as a `disabled: true` stub with no map rendering.
- **P2 — shipped 2026-08-18 (`layerviewer-phase2-tools` epic):** `MeasureTool` (terra-draw
  + turf → distance) and `AnnotationLayer` (terra-draw point/line/polygon/freehand,
  session-only — no `annotations.json` persistence; `onAnnotationsChange` is the escape
  hatch for a consumer that wants its own) built directly into `<LayerViewer>`;
  `CompareSwipe` (two-layer swipe divider, not specifically a two-date before/after — any
  two registered layers) and `AlignControl` (manual per-layer nudge — the no-RTK
  workaround) as separate sibling components. See "Phase 2 tools" above for the full
  writeup, including the required Measure/Annotate click-ownership integration check. 2.5D
  DSM drape was NOT part of this epic — still unscoped.
- **P3:** `<Model3D>` (glTF mesh + point-cloud viewer) — a **separate epic**, not planned
  here.
- **P4 (per CBA):** thermal activation — flip `disabled: false` on the existing stub once
  a radiometric sensor is acquired; zero component rework required, by design.

## Real data update (2806 Prado, real georeferenced-fix story)

The sample ortho/hillshade/contours are no longer synthetic placeholders — they're the
operator's own real 2806 Prado St nadir-grid photogrammetry: a real OpenDroneMap
reconstruction (99% frame alignment) reprojected to EPSG:3857 (`rio warp` + `rio cogeo
create`/`validate`, the same pipeline `/pipeline/README.md` documents), with hillshade and
2.5m contours derived directly from the real reconstructed DSM. Released for public use by
the property's owner (full release rights) — distinct from the separate professional
real-estate-shoot photos CLAUDE.md's stricter release-forms rule still covers. `parcel.geojson`
stays an approximate reconstruction-footprint placeholder (not a real recorded parcel), and
`thermal` reverted to a `disabled: true` stub (no radiometric sensor exists) — see
`public/layer-viewer-samples/2806-prado/manifest.test.ts` for the exact assertions. A real,
important bug was found and fixed getting here: the first ODM run had `has_gps: false`
(frame extraction via `ffmpeg -vf fps=1` didn't carry GPS EXIF into the extracted JPGs), so
it reconstructed correctly relatively but anchored at a bogus location. Fixed by injecting
real per-frame GPS (from `exiftool -ee -G3 -json -n`) into the extracted frames before
re-running ODM.

### v2 update — nadir + oblique orbit, real tree canopy

That first fixed run (now called v1 locally) was still nadir-only — both flight passes
pointed straight down, and the property's 100+ ft trees rendered as smeared, streaked
texture in the ortho. Reprocessing the same nadir-only source at progressively higher
quality settings produced no meaningful improvement, which confirmed this was never a
processing-quality problem: a straight-down camera can only ever see a tree's canopy top,
never its sides, at any point-cloud density. v2 adds a real oblique orbit clip (`0023`,
gimbal tilted ~45-60°, ~3 min circling the property, already present in the flight's own
catalog — no reflight needed) to the same reconstruction. No merge step required: every
clip already carries its own embedded GPS, so the oblique frames just join the same image
pool as the nadir grid for one ODM run. 260 of 264 total frames reconstructed; real,
visible improvement in the tree canopy (coherent leaf/branch texture, not perfect, but no
longer streaked). `hillshade.tif`/`contours.geojson` were regenerated from v2's DSM in
lockstep, same "one atomic dataset" discipline as the original COG-bounds fix.
