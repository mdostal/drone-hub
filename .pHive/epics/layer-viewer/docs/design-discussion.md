# Design Discussion — `<LayerViewer>`

## 0. Prelude

**NORTH STAR** (from `.pHive/project-profile.yaml`, still applicable)
- Goal: ship plug-and-play components importable into mdostal.com.
- Scale: no architectural split between component-library and app scale;
  local-first, external streaming layered in incrementally; scale-affecting
  decisions raised individually. (Applies here too: sample COG served from
  `public/`, same as video-tour's stills — not R2 yet.)

**PRIOR DECISIONS** (from video-tour, directly reusable): gating via
`middleware.ts` + `lib/gate.ts` (cookie, fails closed, matcher-extensible);
`next/dynamic({ssr:false})` for every heavy viewer; Vitest + RTL as the test
stack; `public/<feature>/<slug>/` as the P1-only local-asset convention.

**Operator correction (2026-08-07):** the Phase-0 nadir-grid-pass blocker
never blocked building/testing the components — only getting *real* Prado/
Omaha data. CLAUDE.md corrected accordingly. This epic proceeds now against
public sample data.

## 1. Goal

Ship `<LayerViewer>` — CLAUDE.md's stated "core"/"killer feature" component —
as a MapLibre GL satellite base map with toggleable, opacity-controlled
georeferenced overlays, driven by a typed layer registry. Fully built and
tested against real public sample geospatial data now; real Prado/Omaha data
swaps in later via new registry entries, no rework.

## 2. Proposed approach

**Get the layer-registry type right first (it's the architectural point),
then build the map + controls against it, proven with real sample data —
not mocks.**

1. **`lib/layer-types.ts`** — typed layer registry, mirroring `lib/tour-types.ts`'s
   pattern (a manifest-driven component family): `LayerDef {id, type, url,
   opacity, toggle, disabled?, legend?}`. `type` matches CBA's literal spec
   exactly — `'raster' | 'geojson'` (not a divergent `'raster-cog'` /
   `'raster-tiles'` split, corrected after grill flagged the mismatch against
   CBA's own thermal-stub example `type:'raster', legend:'ironbow',
   disabled:true`). Raster layers additionally carry `format?: 'cog' | 'xyz'`
   (defaulting to `'cog'`) so `<LayerViewer>` knows which MapLibre source
   builder to use — ortho/hillshade are `raster`+`cog` here; the basemap
   itself is handled separately (it's not a registry entry, it's the map's
   base). `url` is `string | null` — `null` is valid and expected for a
   `disabled: true` stub (the thermal slot: no data exists, so there's
   nothing to hold a URL). A `PropertyLayers` manifest (`{slug, title,
   layers: LayerDef[]}`) is analogous to `Tour`.
2. **Sample data sourcing** — a real small public COG (rio-tiler's own test
   fixture, already verified reachable) standing in for an ortho layer; a
   hillshade/DEM layer (real public elevation COG if one can be sourced
   cleanly, else a clearly-labeled synthetic hillshade raster); a synthetic
   (not real-address) parcel boundary GeoJSON. All under
   `public/layer-viewer-samples/<slug>/`, with a scoped `.gitignore` negation
   for the blanket `*.tif` rule (that rule exists to keep *real* gated ortho
   data out of git — sample/test data is the opposite case and should be
   explicitly allowed, narrowly).
3. **`<LayerViewer>`** — MapLibre GL map, Esri World Imagery satellite basemap
   (free, no token, verified reachable), renders each `LayerDef` as a MapLibre
   source/layer: COG rasters via `@geomatico/maplibre-cog-protocol` (already
   locked in package.json, unused so far), GeoJSON via a plain MapLibre
   `geojson` source. Opacity and visibility driven by registry state.
4. **`<LayerControl>`** — toggle + opacity-slider panel, one row per
   `LayerDef` (disabled/greyed for `disabled:true` entries — the thermal
   stub). This is the "killer feature" UI: toggling and fading layers.
5. **Gated route** — extend `middleware.ts`'s matcher to cover a new path
   (`/properties/*`), mount via `next/dynamic({ssr:false})`. **Not** a copy-
   paste of video-tour's gating as originally drafted — grill caught that
   `lib/gate.ts`'s `sanitizeNextPath` hardcodes `next.startsWith("/tours")`,
   falling back to `/tours` otherwise. Left as-is, a `/properties/[slug]`
   passcode redirect would silently bounce the user to `/tours` instead of
   their property. This story must generalize `sanitizeNextPath` to accept
   any gated prefix (e.g. check against the same prefix list the middleware
   matcher uses), not just add a new route on top of the old hardcoded check.
   **Also accepted as a known scope limitation (not silently passed through):**
   gating stays one global passcode/cookie for the whole app, covering both
   `/tours/*` and `/properties/*`. CLAUDE.md's phrasing ("until Mathew
   explicitly flips a given tour/dataset public") suggests per-dataset
   control, which this does NOT provide — every gated property/tour shares
   one switch. Acceptable for now (matches what video-tour already shipped,
   and there's exactly one operator), but a real gap if this ever needs to
   share different properties with different people. Flagging, not solving,
   here.
6. **Thermal stub** — one registry entry, `type:'raster', legend:'ironbow',
   disabled:true, url:null`. `<LayerViewer>` explicitly skips adding a
   MapLibre source/layer for any entry where `disabled: true` (no data to
   render, so nothing to add to the map) — `<LayerControl>` still renders its
   toggle row, greyed out and inert (matches the "this toggle is visibly
   present but inert" intent, now specified as an actual render-time branch
   rather than a description of the vibe).

## 3. Scale assessment

**Medium.** New typed data layer (layer registry) + new component family +
new gated route + real sample-data sourcing, but no new app-shell/test/gating
infrastructure (video-tour already built all of that, and it's directly
reusable). Comparable shape to video-tour's own Medium call. H/V slice
planning applies; structured outline does not.

## 4. Risks

- **`@geomatico/maplibre-cog-protocol` is an unused dependency until this
  epic** — first real exercise of it. If it has rough edges (e.g. large-COG
  performance, CORS on the sample COG's GitHub-raw host), that surfaces here,
  not in a vacuum. Mitigated by picking a genuinely small sample COG.
- **Hillshade sample-data gap.** Unlike the ortho layer (a clean COG fixture
  exists), there's no equally clean "here's a small real public DEM COG"
  answer researched yet. The sourcing story may end up synthesizing a
  hillshade-style raster rather than using real elevation data. Documented as
  an acceptable P1 compromise (proves the layer-toggle mechanic, which is the
  point), not silently hidden.
- **`*.tif` gitignore collision.** The existing blanket rule exists for a real
  reason (never accidentally commit gated ortho/DSM data). The fix is a
  narrow, path-scoped negation, not loosening the rule generally — get this
  wrong and either the sample data can't be committed, or the rule stops
  protecting real gated data later.
- **Registry type must anticipate real data**, not just the sample shapes —
  e.g. real orthos will be much larger than the sample COG and likely live on
  R2, not `public/`. `url` staying a plain string (local path or eventually
  R2 URL) keeps the *type* swap trivial, but grill correctly flagged that
  "url stays a string" glosses over a real mechanism gap: R2 is a different
  origin than this cookie-gated app, and `maplibre-cog-protocol`'s
  browser-side fetch won't carry the gate cookie cross-origin. Real gated
  ortho data will need presigned URLs or a same-origin proxy route — a
  mechanism this epic's sample data (same-origin `public/`, no cross-origin
  fetch) never exercises. Explicitly deferred, not solved: noted here so it
  isn't rediscovered as a surprise when real R2 data lands.
- **PMTiles (`pmtiles` package, locked in package.json) stays unused this
  epic.** CBA's target pipeline is "tile to PMTiles/COG"; this epic only
  exercises the raw-COG path via `@geomatico/maplibre-cog-protocol`, which is
  the right choice for one small sample/real COG but not for large tiled
  datasets. Flagging so it isn't assumed PMTiles was evaluated and rejected —
  it just isn't needed yet at this data scale.

## 5. Dependencies

- None on Phase-0 (explicitly unblocked, see prelude).
- `<Model3D>` is a separate, later epic (Phase 3 per CBA) — not planned here.
- Real Prado/Omaha WebODM output (ortho/DSM/mesh), when it exists, becomes new
  registry entries pointing at R2 — a follow-up story then, not a rebuild.

## 6. Decisions made without a blocking gate (operator asked to keep moving; documented here for review)

1. **Sample ortho** → rio-tiler's test fixture COG (real, small, verified
   reachable, directly exercises the COG-rendering path).
2. **Sample parcel boundary** → synthetic polygon, not a real address —
   avoids any PII/legal ambiguity CLAUDE.md's hard rules would otherwise
   raise for zero benefit (the mechanic doesn't need real parcel data).
3. **Sample hillshade** → real public elevation COG if quickly sourceable
   during the sourcing story, else synthetic — left flexible rather than
   pre-pinned to an unverified URL.
4. **New gated path** → `/properties/[slug]` (parallel to video-tour's
   `/tours/[slug]`), extending the existing middleware matcher rather than
   building new gating logic.
5. **Scope** → Phase-1 only (`<LayerViewer>` + `<LayerControl>`); Measure/
   Annotate/Compare/Align (Phase 2) and `<Model3D>` (Phase 3) are explicitly
   out of this epic, matching CBA's own phase boundaries.
