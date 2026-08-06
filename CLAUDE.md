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

## ⚠ PHASE 0 — THE REAL BLOCKER (do before the hive)
His current shots are **obliques that will NOT photogrammetrically align.** Fly **ONE nadir grid pass** (camera straight down, ~75/70% overlap) over 2806 Prado or an Omaha lot → WebODM → reference **ortho + DSM + mesh**. Without this the hive builds empty viewers. Also open: verify Litchi/Dronelink controls the Mini 5 Pro (DJI locks Mini-class SDK); and a WebODM box (16–32GB RAM — dev machine MIA → cloud VM or WebODM Lightning ~$20–40/property). Frame all output as **visual property-intelligence, NOT survey-grade** (no RTK = 1–3m drift → `AlignControl` manual nudge is mandatory).

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
