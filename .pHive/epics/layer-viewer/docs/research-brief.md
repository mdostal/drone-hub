# Research Brief — `<LayerViewer>`

## Codebase state (as of 2026-08-07, after the video-tour epic)

This repo is **no longer pre-implementation**. The video-tour epic
(`feat/video-tour`, this branch is based on it) already shipped:

- **App shell**: `next.config.ts`, `tsconfig.json`, Tailwind 4 CSS-first
  (`app/globals.css`), `app/layout.tsx`. Path alias `@/*` → repo root.
- **Gating**: `middleware.ts` (matcher `["/tours/:path*"]` today — needs
  extending for a new gated surface) + `lib/gate.ts` (cookie-based passcode
  check, fails closed, reusable as-is per its own doc comment: "Add new gated
  path prefixes to middleware.ts's matcher as they appear").
- **Test infra**: Vitest + React Testing Library, `vitest.config.mts` (jsdom
  env, `@/*` alias, `@vitejs/plugin-react`), `npm test`.
- **Conventions** (`.pHive/CONTEXT.md`): every heavy viewer wrapped in
  `next/dynamic({ssr:false})`; `public/<feature>/<slug>/` as a deliberate
  P1-only local-asset convention before R2; a component's reference
  prototype (when one exists) is the spec of record — there is none for
  `<LayerViewer>`, so CLAUDE.md + `docs/CBA.md` are the spec of record here.
  Methodology: mostly BDD, TDD for complex logic units.

## What CLAUDE.md / docs/CBA.md specify

- **The component**: MapLibre GL satellite base + toggleable, opacity-controlled
  georeferenced overlays — ortho, thermal (disabled stub), hillshade/heightmap,
  contours, parcel boundary. "**This layer toggle is the killer feature.**"
- **The architecture**: a **typed layer registry** `{id, type, url, opacity,
  toggle}` drives everything — CBA calls this "the owned IP," not incidental.
  `type:'raster', legend:'ironbow', disabled:true` is the exact shape specified
  for the thermal stub slot.
- **Stack (locked in package.json, unused so far)**: `maplibre-gl` ^4.7.0,
  `pmtiles` ^3.2.0, `@geomatico/maplibre-cog-protocol` ^0.4.0 (renders COG
  GeoTIFFs directly as MapLibre raster sources — no tile server needed).
- **Basemap**: CBA specifies a free source, no token — Esri World Imagery or
  MapTiler free tier. Verified reachable: Esri's ArcGIS World_Imagery tile
  endpoint returns a real 200 JPEG tile
  (`server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`).
- **Phase-0 correction (just made to CLAUDE.md)**: the nadir-grid-pass blocker
  only blocks *real* Prado/Omaha data — building and testing against public
  sample data is explicitly unblocked now, same pattern video-tour already
  proved (shipped against stills before real clips existed).

## Sample data verified reachable from this environment

- **Sample COG (ortho stand-in)**: `cogeotiff/rio-tiler`'s own test fixture,
  `raw.githubusercontent.com/cogeotiff/rio-tiler/main/tests/fixtures/cog.tif`
  — a real, small, georeferenced Cloud-Optimized GeoTIFF used by that
  project's own test suite (redirect from the `/raw/` URL confirmed working).
  Good fit: it's specifically a COG, so it directly exercises
  `@geomatico/maplibre-cog-protocol` the same way a real ortho would.
- **Hillshade/DEM sample**: not yet pinned to a specific URL. CLAUDE.md's
  target pipeline bakes hillshade from USGS 3DEP via the sibling personal-site's
  `bake-property.py` (rasterio) — that script isn't in this repo and 3DEP's
  API isn't trivially a single small pre-baked COG download. Leaving the exact
  source to the sourcing story, with two acceptable paths: (a) find and pull a
  small real public-domain elevation COG, or (b) generate a synthetic
  hillshade-style raster (grayscale gradient/noise GeoTIFF) if a suitable real
  one can't be found quickly — either way, clearly labeled as sample data in
  the layer registry and docs, not represented as real terrain.
- **Parcel boundary**: deliberately **not** sourced from a real parcel record
  (CLAUDE.md's PII rule is about names/addresses; a real parcel boundary tied
  to a real address is exactly the kind of thing to avoid pulling in for a
  throwaway sample). A synthetic rectangular/polygon GeoJSON, clearly labeled
  placeholder, is the safer and sufficient choice — the registry only needs a
  valid boundary polygon to prove the clip/toggle mechanic, not a real one.
- **`*.tif` is currently gitignored repo-wide** (`.gitignore` line: `*.tif`,
  under the "gated/un-released property assets" comment). This blanket rule
  will incorrectly catch the sample COG too — needs a scoped negation for
  wherever the sample lives (e.g. `public/layer-viewer-samples/**`), not a
  removal of the rule (real gated ortho/DSM data should stay excluded).

## What this means for planning

1. No app-shell work needed this time — reuse what video-tour built.
2. New gated route needed (e.g. `/properties/[slug]`), extending
   `middleware.ts`'s matcher — same `lib/gate.ts` logic, no new gating design.
3. The layer registry type (`lib/layer-types.ts`, mirroring `lib/tour-types.ts`'s
   pattern) is the architectural core — get this right first, everything else
   (LayerViewer's rendering, LayerControl's UI) is driven by it.
4. Sample-data sourcing is real engineering work (a story of its own), not a
   formality — same weight video-tour's `video-tour-prado-manifest` story had.
5. Scope stays Phase-1 per CBA: `<LayerViewer>` + `<LayerControl>` (toggle +
   opacity) only. Measure/Annotate/Compare/Align are Phase 2. `<Model3D>` is a
   separate epic (Phase 3).
