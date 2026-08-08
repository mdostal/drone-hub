# Drone Hub — property-intelligence platform (hive kickoff brief)

> Reusable, **plug-and-play** React components + a standalone app for drone property
> intelligence. The point is the COMPONENTS (drop into mdostal.com or run standalone),
> not one page. Do NOT "rebuild /drone" — build components that get imported.

## What it is (the reference: Hammer Missions — hub.hammermissions.com)
A drone data viewer where you:
- Drape a **georeferenced ortho / thermal** over a **Google/satellite map base**.
- **Toggle layers** on/off with opacity: visual ortho · thermal · LiDAR hillshade/heightmap · contours · parcel boundary · captured-vs-aligned. **This layer toggle is the killer feature.**
- View an interactive **3D model** (point cloud + mesh), orbit it, **measure** distances on it.
- **Annotate** — draw shapes/points/labels on the imagery AND on video; zoom in.
- **Compare** two dates/datasets side by side.
- Filter image thumbnails by tag / altitude / AI-confidence.

## The components to build (plug-and-play)
1. **`<LayerViewer>`** — base map (MapLibre GL, satellite base) + toggleable, opacity-controlled georeferenced overlays (ortho / thermal / hillshade / heightmap / contours / boundary). Measure + annotate tools. **The core.**
2. **`<Model3D>`** — 3D mesh / point-cloud viewer (three / react-three-fiber, + potree for point clouds); orbit, measure, layer between visual/thermal texture.
3. **`<VideoAnnotator>`** — play a clip, scrub, zoom, draw shapes/points/labels over the video, export. **Mathew already has repo parts that did video annotations/overlays — reuse them.**
4. **`<Gallery>`** — plain shots carousel (shadcn carousel — trivial, https://ui.shadcn.com/docs/components/base/carousel).
5. Footage/feeds surface (video off-Vercel — Cloudflare Stream).

## Operator reality (design to THIS)
- Solo fractional CTO, strong builder. Flies a **DJI Mini 5 Pro** — great camera, sub-250g, **NO thermal, no RTK**. Has a Garmin-mini GPS that hasn't helped alignment.
- Stack: **Next.js 15 · React · Tailwind · shadcn**, deployed on **Vercel** (bandwidth-conscious). Data is **passcode-gated**.
- His drone shots today are obliques / annotated stills — to overlay accurately on a map they must become a **georeferenced nadir ortho** (fly downward passes → photogrammetry). Thermal deferred until he has a thermal cam.

## Data pipeline (target)
nadir passes → **WebODM / OpenDroneMap** → orthomosaic (COG/GeoTIFF) + DSM + point cloud (LAZ) + glTF mesh → tile to **PMTiles / COG** → `<LayerViewer>` (map) + `<Model3D>`. LiDAR hillshade/heightmap baked from USGS 3DEP (see personal-site `scripts/bake-property.py`, rasterio). Parcel boundary GeoJSON from his parcel tool clips everything to one grid (the #1 registration gate).

## Stack / plugins — FINALIZED (see `docs/CBA.md` + `package.json`)
**Decision: BUILD & own the viewer, BUY only compute (WebODM), NEVER embed the SaaS.** Core deps are in `package.json`: `maplibre-gl` + `pmtiles` + `@geomatico/maplibre-cog-protocol` (map/layers), `@turf/turf` + `terra-draw` (measure/annotate), `three` + `@react-three/fiber` + `@react-three/drei` (3D), `hls.js` (feeds), `embla-carousel-react` (gallery), `@aws-sdk/client-s3` → **Cloudflare R2** (heavy assets, zero egress — the Vercel-bandwidth answer). Pipeline (WebODM/GDAL/rio-*/PDAL/tippecanoe) lives in `/pipeline` as scripts+docker, **never in the bundle**. Every heavy viewer = `next/dynamic({ssr:false})`.

## ⚠ PHASE 0 — blocks REAL Prado/Omaha data, not component-building
His current shots are **obliques that will NOT photogrammetrically align.** Fly **ONE nadir grid pass** (camera straight down, ~75/70% overlap) over 2806 Prado or an Omaha lot → WebODM → reference **ortho + DSM + mesh**. Also open: verify Litchi/Dronelink controls the Mini 5 Pro (DJI locks Mini-class SDK); and a WebODM box (16–32GB RAM — dev machine MIA → cloud VM or WebODM Lightning ~$20–40/property). Frame all output as **visual property-intelligence, NOT survey-grade** (no RTK = 1–3m drift → `AlignControl` manual nudge is mandatory).

**Correction (operator, 2026-08-07): this does NOT block building `<LayerViewer>`/`<Model3D>`.** Scaffold, build, and fully test them now against public sample data (a sample COG orthomosaic, a USGS 3DEP sample hillshade/DSM, a sample parcel boundary GeoJSON, a public-domain glTF mesh) pulled from the open internet — same pattern as `<VideoTour>` shipping against the Prado stills before real spin/transition clips existed. Real Prado/Omaha nadir data swaps in later; it should not require rework, just new manifest entries pointing at real R2 assets instead of the sample ones. The original framing above ("without this the hive builds empty viewers") was wrong and is superseded by this note.

## Build phases (full plan in docs/CBA.md)
Phase 1 (MVP this week): `MapLayerViewer` + `LayerControl` + `VideoAnnotator` (port his code) + `GalleryCarousel`, tiles as PMTiles on R2, on a typed **layer registry** `{id,type,url,opacity,toggle}`. Phase 2: `MeasureTool` + `AnnotationLayer` + `CompareSwipe` + `AlignControl` + 2.5D drape. Phase 3: `Model3DViewer` (glTF → point cloud). Phase 4: thermal (stubbed slot now, flip on when a radiometric sensor is acquired).

## Rights & privacy (hard rules)
- Property footage = shoot-permission being formalized (release forms) → **private/gated until signed**; never deploy un-released assets un-gated. Owner PII (names/addresses) never stored/shown.
- `family-reunion-aerial` clip = group of people incl. minors → never used.

## Related / existing work (personal-site, already shipped)
- `/drone` gated page + `<PropertyCard>` (tabbed) + `bake-property.py` (rasterio DEM baker) live on mdostal.com. Real AZ + MT LiDAR terrain baked. This repo supersedes the flat-carousel approach with the real layer viewer.
- drone.mdostal.com → redirects to the gated /drone (Vercel domain attached).

## Hive kickoff — what to build first
Ship `<LayerViewer>` (MapLibre + satellite + toggleable hillshade/heightmap/boundary layers, opacity + measure + annotate) as the first plug-play component, wired to a folder-per-property manifest. Then `<VideoAnnotator>` (from his existing code), then `<Model3D>`. Keep everything importable into personal-site. See `docs/` for the CBA output when it lands.

## Vision expansion (operator, 2026-08-07) — component-framework docs site + overlay/content-engine

**This is fundamentally a component framework (shadcn-style), not an app.** Every
component gets its own showcase surface: live demo + sample data + props docs +
usage snippet — "components, samples, and display as well as full documentation
AROUND the components entirely." Build this pattern once as shared docs-site
infrastructure, then every component (including `<VideoTour>`/`<LayerViewer>`
already shipped) gets a page in it. This is a durable structural requirement, not
a one-off page.

**New product surface: 3D-overlay + landscape-to-Minecraft content engine.**
Beyond CBA's original phase plan, the operator needs:
1. **`<Model3D>` overlaid onto the land** (a real, buildable 2.5D/3D drape — a
   glTF model composited into `<LayerViewer>`'s georeferenced map/terrain
   context, anchored at a real lat/lon).
2. **`<Model3D>` overlaid onto video, scene-tracked** (the model appears
   anchored to a fixed point in the video's 3D space as the camera moves — NOT
   a static screen-pinned overlay). **Drone-native approach, not generic SLAM:**
   DJI exports carry per-frame GPS + gimbal pitch/yaw/roll telemetry (burned into
   an `.SRT` sidecar, or extractable from `.DAT` flight logs). Given that
   telemetry + a known real-world position for the 3D model (from the same
   georeferenced layer data `<LayerViewer>` already uses), the camera's
   pose/projection matrix per video timestamp is computable directly — no
   vision-based SLAM/structure-from-motion needed. This is the "easy toolset
   FOR the drone stuff" the operator wants: real telemetry-driven AR compositing
   that doubles as a showcase of the flight-log data itself.
3. **Landscape → Minecraft voxelizer.** Convert the DSM/hillshade terrain data
   (same raster layers `<LayerViewer>` renders) into a blocky, Minecraft-style
   voxel terrain mesh (three.js/r3f, same renderer as `<Model3D>`), with a
   sample structure/house model placeable on it.
4. **Content engine page** — a new gated per-property page (NOT a mode inside
   `<LayerViewer>` — a separate surface) that composes: the Minecraft-voxel
   view + a sample structure, "engineering" documentation, and flight-log/
   telemetry docs, so a visitor sees "the engineering, the minecraft of it, the
   flight docs" together. Ships against sample/placeholder engineering + flight
   docs for now (no real files exist yet) — same public-sample-data pattern as
   `<VideoTour>`/`<LayerViewer>`.

**Pipeline framing matters as much as the components:** the operator wants this
buildable as an actual repeatable pipeline he can run his own drone footage
through later ("overlay drone footage directly into this and pipeline this...
so our components are super easy to just run through"), not a one-off demo.
Favor composable, documented steps (telemetry parse → pose compute → composite)
over ad-hoc one-off code.

**Priority order (operator-confirmed, 2026-08-07):** `<Model3D>` (foundation,
needed by everything below) → 3D-on-land overlay → Minecraft voxelizer +
content-engine page → telemetry-driven video overlay → CBA's original Phase 2
tools (Measure/Annotate/Compare/Align), which queue behind all of this new
scope, not ahead of it.
