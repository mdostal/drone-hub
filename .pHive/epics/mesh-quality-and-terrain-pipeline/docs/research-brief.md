# Research brief — mesh-quality-and-terrain-pipeline

## Requirement (operator, verbatim across several messages)

> "can we take the neighbors house out? ... ideally we get that just like
> the house boundary perfect so we can do all the overlays on one thing and
> flop it on and off and show the model separate"

> "The terrain should come from lidar and whatnot. The arizona and utah
> areas and stuff should be the top end ones there."

> "any chance we can meld the 3d model like we did on the main site so we
> get the fill in and shadows and stuff? And we need a way to determine and
> figure out if our clip is missing areas and how to grab or figure those
> our so we get the rest of the areas into the pic as well"

Plus a full drafted requirements doc ("Property → Voxel/Minecraft Pipeline")
covering a much larger scope: DEM/LiDAR ingest, mesh→voxel structure
placement (DWG/CAD conversion, Draco decode), a `featureGrid` param, biome
palettes, and a headless beauty-render step. The operator's own sequencing
in that doc and in-session ("THEN we want to take and do the house from the
CAD stuff... after we have the full area from the lidar") puts the
structure/CAD/Minecraft-world half of that spec explicitly AFTER this
terrain+mesh-quality work, not alongside it.

## Current state, verified by reading files/running checks, not assumed

### What's already real (this session, now merged to master)

`pipeline/scripts/` (landed via the tools-skill-layer PR, merged as a
prerequisite for this epic) already has: `crop-mesh.py` (trimesh-based
per-material crop by real-world lat/lon bounds via a UTM-offset reprojection,
plus Y-up axis correction), `convert-mesh.sh` (obj2gltf + gltf-transform
resize/draco chain), `reproject-ortho.sh`/`render-hillshade.sh`/
`render_hillshade.py`/`extract-contours.py` (raster pipeline), `run-odm.sh`/
`extract-gps-frames.sh` (capture-to-reconstruction), `build-manifest.py`
(assembles `layers.json`/`model.json`).

The real v2 Prado reconstruction (nadir + oblique orbit) is live in
`public/layer-viewer-samples/2806-prado/` and `public/model3d-samples/prado/`.
A parallel session (visible via `git log`, not authored by me) has since
landed further real work on the SAME data: `lidar-hillshade.tif` (a second,
independent USGS 3DEP elevation source alongside the ODM-derived DSM
hillshade — already wired into `layers.json` as a togglable `lidar_hillshade`
layer), a real TCAD parcel boundary (`parcel.geojson`), real 2.5m contours,
and — critically for this epic — the mesh is now draped onto `LayerViewer`
via the land-overlay epic's `GeoAnchoredModel`/`createModelLayer()` engine
(`lib/maplibre-model-layer.ts`), with a real Y-up/winding fix landed
("Fix Model3D rendering real Z-up photogrammetry meshes as broken
fragments", "remove a wrong double-rotation, keep only the winding fix").

### A real, live privacy exposure found while researching this epic

`public/layer-viewer-samples/2806-prado/parcel.geojson`'s `properties.note`
field contained an "Owner of record: [full legal name]" phrase — live right
now at
`drone-hub-rust.vercel.app/framework/layer-viewer-samples/2806-prado/parcel.geojson`,
confirmed via a direct fetch. This goes beyond what's been discussed/
authorized so far (imagery, telemetry, video) — a full legal name tied to an
exact parcel boundary, publicly indexable, on a property currently being
sold. In scope for this epic since it's touched by the parcel-crop story
regardless. (Redacted here too, in this planning doc — see the
open-source-release review that caught this doc still quoting the PII
verbatim after the source file itself was fixed.)

### The neighbor's-house / "perfect boundary" ask

`crop-mesh.py` already accepts `--lat-min/--lat-max/--lon-min/--lon-max`
bounds directly (plus `--coords-txt` for the UTM-offset reprojection) — it
was BUILT for exactly this, but the real v2 mesh currently shipped
(`public/model3d-samples/prado/model.glb`) was cropped once, this session,
against manually-chosen local-frame bounds (`--x-min -30 --x-max 30...`),
not against the real recorded parcel boundary now available in
`parcel.geojson`. Re-cropping against the ACTUAL parcel polygon (with a
small buffer for the structure's real footprint vs. the legal boundary) is
mechanical, not new capability — the tool already does exactly this.

### "Meld like the main site... fill in and shadows"

Checked `personal-site`'s `/drone` page and `scripts/bake-property.py`
directly rather than guessing. `bake-property.py` is a 2D DEM→hillshade
*image* baker (the same slope/aspect illumination formula already ported
into `pipeline/scripts/render_hillshade.py`) — no distinct 3D mesh-melding
or shadow technique found there to copy. No `PropertyCard` component exists
in the current `personal-site` checkout either (referenced in drone-hub's
own `CLAUDE.md` but not present now — likely superseded/moved). This means
"meld... fill in and shadows" has to be built as new work, informed by two
real, separable graphics concepts rather than one:
1. **Fill the holes** — the current mesh has real, visible gaps (confirmed
   in the operator's own screenshots) where photogrammetry reconstruction
   failed (occlusion, insufficient overlap, reflective surfaces). The
   DSM-derived terrain surface (`hillshade.tif`, already real, already
   shipped) covers the SAME footprint with no holes — draping/compositing
   that terrain surface as a base layer beneath the mesh means gaps show
   real (if lower-detail) terrain instead of blank white.
2. **Real shadows** — `components/Model3D/Model3D.tsx` currently lights the
   scene with flat ambient + a few `directionalLight`s, none of them
   shadow-casting (no `<Canvas shadows>`, no `castShadow`/`receiveShadow`).
   Adding a real shadow-mapped light is a separate, well-understood
   three.js/r3f change.

### Coverage-gap detection

`components/FlightCoverageAnalyzer` already exists and already flagged
canopy occlusion as this property's real coverage risk — but it judges
*flight telemetry* (GPS/altitude pass overlap), not the *reconstructed
mesh's* actual holes. What the operator is describing — "is our clip
missing areas, how do we grab or figure those out" — is a different,
new capability: analyzing the OUTPUT mesh's gaps and mapping them back to
real-world direction/location, so a follow-up flight knows where to point
the camera. No existing tool in this repo does this.

### LiDAR terrain, AZ/UT flagship

`personal-site/public/drone-samples/` has real, already-baked AZ/UT/MT
terrain — `az-height.webp`, `az-hillshade.webp`, `mt-height.webp`,
`mt-hillshade.webp` — but these are flattened 2D images (hypsometric-tinted
RGB), not the raw DEM/heightmap grid `VoxelTerrain` needs. No raw DEM
GeoTIFF for those locations was found locally (searched `~/Documents`,
`~/Desktop`, `~/Downloads`). USGS 3DEP (the same free, public, no-auth
source already used for Prado's real `lidar-hillshade.tif`) covers AZ/UT
with no flight required — this session's own external work already proved
DEM→heightmap→`.schem` end-to-end from a real 3DEP AZ tile
(`az-compound.schem`, 128³, 91k blocks, "~15 lines of rasterio"). That
script isn't formalized/committed anywhere in this repo yet.

### Tool availability (checked directly, not assumed)

`rasterio` (1.5.0), `trimesh` (5.0.0, `voxelized()` present), `numpy`,
`Pillow` — all present, all already proven this session. `gdaldem`,
`gdal_contour`, `gdalinfo`, `ogr2ogr`, `pdal` (CLI and Python module), the
ODA File Converter, and Chunky/Mineways are **not installed** on this
machine — confirmed via direct `which`/`import` checks. This matches the
operator's own drafted spec's blocker list exactly. Everything in THIS
epic's scope is achievable with what's already installed (rasterio/trimesh/
numpy); the DWG→OBJ conversion and headless beauty-render steps genuinely
need new tool installs and are explicitly out of scope here (see below).

## Explicitly out of scope for this epic

- **DWG/CAD → structure voxelization** (needs ODA File Converter or
  LibreDWG, neither installed) and the **headless beauty renderer** (needs
  Chunky or Mineways, neither installed) — real, external-tool blockers,
  and the operator's own sequencing puts this work after the terrain/mesh
  work ("THEN... after we have the full area from the lidar").
- **`featureGrid` param / biome palette config** — genuinely depends on the
  structure-placement work above (a footprint needs a placed structure to
  be meaningful) or is small enough to fold into a later epic once the
  voxel-terrain foundation from this epic exists.
- **PDAL-based raw `.las`/`.laz` → DEM rasterization** — not installed, and
  every real elevation source touched by this epic (Prado's ODM DSM, USGS
  3DEP tiles) is already grid/raster-shaped, not raw point clouds needing
  PDAL specifically.
