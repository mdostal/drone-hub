# /pipeline — WebODM/GDAL/rio-\*/PDAL/tippecanoe toolchain (not bundled)

**This directory is documentation-only for now.** No scripts, no Dockerfile,
no runtime code lives here yet — see "Why documentation-only" below for why
that's deliberate, not an oversight.

## What this directory is for

CLAUDE.md's "Stack / plugins — FINALIZED" section states the target data
pipeline:

> Pipeline (WebODM/GDAL/rio-\*/PDAL/tippecanoe) lives in `/pipeline` as
> scripts+docker, **never in the bundle**.

and the intended flow (CLAUDE.md's "Data pipeline (target)" section):

> nadir passes → **WebODM / OpenDroneMap** → orthomosaic (COG/GeoTIFF) + DSM
> + point cloud (LAZ) + glTF mesh → tile to **PMTiles / COG** →
> `<LayerViewer>` (map) + `<Model3D>`

`package.json`'s `_pipeline_not_bundled` comment names the specific tools
this eventually covers:

```
WebODM (docker), GDAL (gdal2tiles/gdaldem/gdal_contour), rio-cogeo,
rio-pmtiles, rio-rgbify, PDAL (LAZ->COPC), tippecanoe,
gltf-transform/obj2gltf — live in /pipeline as scripts+docker, never in
the Vercel bundle.
```

None of that tooling is an npm dependency and none of it ships to Vercel —
`/pipeline` is a sibling of `app/`, `components/`, and `lib/` specifically so
it's structurally obvious (and enforced by "just don't import it from
anywhere under those three") that it never enters the Next.js bundle. When
built out, this directory's shape is expected to be:

```
/pipeline
  README.md              (this file)
  docker-compose.yml      (WebODM's own docker-compose stack, or a
                            reference to WebODM Lightning if run as a
                            hosted/cloud service instead of self-hosted)
  scripts/
    reproject-ortho.sh     (rio warp + rio cogeo — see §1 below)
    render-hillshade.sh    (gdaldem/rasterio — see §2 below)
    convert-mesh.sh         (obj2gltf/gltf-transform — see §3 below)
    build-manifest.py      (assembles the LayerDef/ModelDef JSON — the
                            mapping below, automated)
```

None of those scripts exist yet. See "Why documentation-only" below.

## Why documentation-only

CLAUDE.md's Phase-0 gate is explicit: the operator's current drone shots are
**obliques that will not photogrammetrically align** — a real WebODM run
needs a nadir grid pass that hasn't been flown yet. There is, right now, no
real `odm_orthophoto.tif`/`odm_dem.tif`/`odm_texturing` output anywhere to
run a conversion script against. A script written today would have nothing
real to validate against and would necessarily encode guesses about real
WebODM output (exact pixel dimensions, CRS quirks, texture-atlas layout)
that this repo has no way to verify. The concrete, actionable deliverable
this directory can ship *today* is the mapping below — precise enough that
writing the actual scripts, once a real WebODM run exists, is mechanical.

**This mapping is not new speculation about how to reproject/COG a raster or
render a hillshade.** Every command cited below is one this repo has
*already run for real*, against real sample data, as part of building
`<LayerViewer>`/`<Model3D>`/the land-overlay epic — see the "cited from"
notes under each step.

## The mapping: real WebODM/ODM output → this framework's manifest shapes

A default WebODM/ODM run's output directory (per-property project root)
contains, among other things:

```
<project>/
  odm_orthophoto/odm_orthophoto.tif
  odm_dem/dsm.tif
  odm_dem/dtm.tif
  odm_georeferencing/odm_georeferenced_model.laz
  odm_texturing/odm_textured_model_geo.obj   (+ .mtl + texture .png/.jpg)
```

None of these are directly consumable by `<LayerViewer>` (`lib/layer-types.ts`'s
`LayerDef`) or `<Model3D>` (`components/Model3D/Model3D.tsx`'s `ModelDef`) as-is
— each needs one real, well-understood conversion step first.

### 1. `odm_orthophoto/odm_orthophoto.tif` → a `LayerDef` raster/cog entry

WebODM's orthophoto is a valid COG, but is virtually never already in
EPSG:3857 (WebODM typically outputs in the project's local UTM zone, same as
this repo's own real sample ortho, which shipped in EPSG:32617). This
repo's `<LayerViewer>` render path (`@geomatico/maplibre-cog-protocol`)
**hardcodes a Web Mercator (EPSG:3857) assumption** and silently
mis-registers any COG that isn't already reprojected — this is not a
hypothetical, it's a bug this repo hit and fixed for real; see
`docs/components/land-overlay.md`'s "Fixed" section for the full root-cause
writeup (imagery rendered off the coast of Norway instead of the real
parcel location until the fix landed). **The exact commands that section
established as this repo's own convention, reused verbatim here:**

```sh
# 1. Reproject to EPSG:3857 (the projection <LayerViewer>'s COG loader assumes).
rio warp odm_orthophoto.tif ortho_3857.tif --dst-crs EPSG:3857 --resampling bilinear

# 2. Re-COG it (tiled + overviews) — a straight reproject alone isn't
#    guaranteed to still be a valid Cloud-Optimized GeoTIFF.
rio cogeo create ortho_3857.tif ortho.tif

# 3. Validate before shipping — catches a malformed/non-COG output early
#    rather than at map-render time.
rio cogeo validate ortho.tif
```

(`docs/components/land-overlay.md`'s "Fixed" section documents this same
three-step sequence — `rio warp --dst-crs EPSG:3857 --resampling bilinear`,
then `rio cogeo create`, then `rio cogeo validate` — as the fix already
applied to this repo's real sample ortho and hillshade. Same commands, same
order, applied here to real ODM output instead of a sample fixture.)

The resulting `ortho.tif` maps to a `LayerDef` (`lib/layer-types.ts`) directly:

```ts
{
  id: "ortho",
  type: "raster",
  format: "cog",       // single georeferenced COG, not pre-tiled XYZ —
                        // matches how public/layer-viewer-samples/2806-prado/
                        // ortho.tif is registered today.
  url: "ortho.tif",     // filename-relative, resolved against the manifest's
                        // own URL at fetch time (see LayerViewer.tsx's
                        // resolveManifest doc comment) — NOT root-absolute,
                        // for the same basePath-portability reason every
                        // other sample layer.json entry uses a bare filename.
  opacity: 1,
  toggle: true,
}
```

### 2. `odm_dem/dsm.tif` (or `dtm.tif`) → the hillshade-generation pattern

This repo's own sample `hillshade.tif`
(`public/layer-viewer-samples/2806-prado/hillshade.tif`) is **synthetic** —
see `docs/components/layer-viewer.md`'s "Sample data provenance" section —
but it was already built through the exact rendering step a real DSM would
go through, just fed a procedural elevation field instead of real ODM
output:

> a procedural elevation field (gradient + ridge sinusoid + smoothed noise
> via `rasterio`/`numpy`/`scipy`), rendered through a real slope/aspect
> hillshade formula (illumination from azimuth 315°/altitude 45°, a
> standard GIS convention), single-band uint8, COG'd via `rio-cogeo`.

For a real `odm_dem/dsm.tif`, the elevation field is no longer procedural
(it's ODM's own DSM raster), but the rendering step is the same
slope/aspect illumination convention — the standard GDAL CLI form of it is:

```sh
# Same azimuth/altitude convention as the existing synthetic sample
# (315°/45°) — for visual continuity between synthetic and real hillshade
# layers, not a technical requirement.
gdaldem hillshade odm_dem/dsm.tif hillshade_raw.tif -az 315 -alt 45

# Same reprojection + re-COG + validate sequence as §1 above — a real DSM
# is exactly as likely to arrive in a non-3857 CRS as the orthophoto is,
# and hits the identical maplibre-cog-protocol bug if skipped.
rio warp hillshade_raw.tif hillshade_3857.tif --dst-crs EPSG:3857 --resampling bilinear
rio cogeo create hillshade_3857.tif hillshade.tif
rio cogeo validate hillshade.tif
```

(`gdaldem hillshade` is the GDAL-CLI equivalent of the
`rasterio`/`numpy`-based slope/aspect hillshade formula the sample data doc
describes hand-rolling — both compute the same illumination model; `gdaldem`
is the tool named for this exact purpose in `package.json`'s
`_pipeline_not_bundled` comment, so it's the natural real-data choice over
reimplementing the formula in `rasterio`.)

Maps to a `LayerDef` the same shape as the existing sample entry, minus the
"synthetic" framing:

```ts
{
  id: "hillshade",
  type: "raster",
  format: "cog",
  url: "hillshade.tif",
  opacity: 0.6,
  toggle: false,
  // No `legend` — the existing sample's
  // legend: "synthetic placeholder — not real elevation data" is exactly
  // the flag that should be DROPPED once the input is a real DSM, not
  // carried forward.
}
```

`odm_dem/dtm.tif` (bare-earth, vegetation/structures removed) would go
through the identical steps to produce a second, separate `LayerDef` (e.g.
`id: "dtm-hillshade"`) if both DSM- and DTM-derived hillshades are wanted as
independently toggleable layers — CLAUDE.md's layer registry has no
cardinality limit on how many raster layers one property can register.

A contour-lines `LayerDef` (`type: "geojson"`, `style: { lineOnly: true }` —
see `lib/layer-types.ts`'s `LayerStyle`) can be derived from the same real
DSM/DTM using the same technique the sample `contours.geojson` already
uses (`skimage.measure.find_contours` on the elevation array, pixel
coordinates converted through the COG's real affine transform to WGS84) —
or, for a real pipeline, GDAL's own `gdal_contour` (named in the
`_pipeline_not_bundled` comment) is the more standard CLI tool for this
step rather than hand-rolling it with `scikit-image`.

### 3. `odm_texturing/odm_textured_model_geo.obj` (+ `.mtl` + textures) → a `ModelDef` entry

ODM's textured mesh output is Wavefront OBJ (`.obj` + a companion `.mtl`
material file + one or more texture images), **not** glTF/glb. `<Model3D>`
loads its model via drei's `useGLTF` (three.js's `GLTFLoader`), which only
understands `.gltf`/`.glb` — the OBJ output needs one conversion step first.
`package.json`'s `_pipeline_not_bundled` comment names exactly the tools for
this: `gltf-transform/obj2gltf`. `obj2gltf` is the tool that actually
performs the OBJ→glTF conversion (`gltf-transform`'s CLI is for
transforming/optimizing glTF that already exists — e.g. Draco-compressing
the output afterward — not for importing OBJ):

```sh
# OBJ (+ .mtl + textures) -> glb. obj2gltf bundles the material/textures
# into the single binary .glb container <Model3D> expects.
npx obj2gltf -i odm_texturing/odm_textured_model_geo.obj -o model.glb

# Optional: Draco-compress the result for a smaller download over Vercel's
# bandwidth-conscious hosting (CLAUDE.md's own stated bandwidth concern) —
# gltf-transform's actual intended use in this pipeline.
npx gltf-transform draco model.glb model.glb
```

Maps directly to a `ModelDef` (`components/Model3D/Model3D.tsx`):

```ts
{
  id: "textured-mesh",
  url: "model.glb",
  title: "<Property title> — textured mesh",
  // unitsPerMeter: left unset until ODM's real output scale is confirmed
  // (ModelDef.unitsPerMeter's own doc comment: omitted -> the measure tool
  // labels distances in raw "units", not fabricated meters, until a real
  // pipeline supplies a known scale). ODM's georeferenced output IS in
  // real-world meters by construction (it's derived from GPS-tagged
  // imagery), so this would very likely become `unitsPerMeter: 1` once
  // verified against the real .obj — but that verification needs a real
  // ODM run to confirm against, not a guess made here.
}
```

**A second mapping, not the same as the one above:** if the goal is
CLAUDE.md's "vision expansion" 3D-overlay-onto-land feature (draping the
mesh onto `<LayerViewer>`'s georeferenced map at the property's real
lat/lon, not just viewing it in isolation in `<Model3D>`'s own scene-space
canvas), the same converted `model.glb` instead maps to a
`GeoAnchoredModel` (`lib/geo-model-types.ts`, the land-overlay epic's
deliberately-separate geo-space type — see that file's own header comment
for why it's not just `ModelDef` with extra fields):

```ts
{
  id: "textured-mesh",
  url: "model.glb",
  title: "<Property title> — textured mesh",
  lat: <property's real latitude>,
  lon: <property's real longitude>,
  scale: 1,   // ODM output is already real-world-scaled in meters
}
```

Which shape is used depends on which component is consuming it —
`ModelDef` for a standalone `<Model3D>` view, `GeoAnchoredModel` for
`<LayerViewer>`'s `models` prop — both are valid, non-exclusive mappings of
the same converted `.glb` file.

### Point cloud (`odm_georeferencing/odm_georeferenced_model.laz`)

Not mapped above — CLAUDE.md's `<Model3D>` scope note (Phase 3: "`glTF` →
point cloud") and its own file header explicitly defer point-cloud
rendering (`potree`) as a separate, not-yet-built capability; there's no
`LayerDef`/`ModelDef` entry to map a `.laz` file to yet. `PDAL (LAZ->COPC)`
is named in `package.json`'s `_pipeline_not_bundled` comment as the
intended tool for whatever that future format conversion turns out to be
(Cloud-Optimized Point Cloud, the point-cloud analog of a COG), but there is
no existing manifest shape on the framework side to document a mapping
into yet, unlike the raster/mesh cases above — this is a real, currently
open gap, not an oversight.

## Everything not covered above

`tippecanoe` (vector-tile generation) and `rio-pmtiles`/`rio-rgbify` (raster
PMTiles/terrain-RGB tiling) are named in `package.json`'s
`_pipeline_not_bundled` comment as part of the target toolchain but aren't
exercised by the mapping above — this repo's current `<LayerViewer>` render
path consumes single-file COGs and GeoJSON directly (see `buildLayerMapConfig`
in `components/LayerViewer/LayerViewer.tsx`), not pre-tiled PMTiles/vector
tiles. Tiling would become relevant if/when a property's raster layers grow
large enough that single-COG delivery stops being practical — CLAUDE.md's
target pipeline names PMTiles as the eventual tile format, but no story has
yet needed it in practice, so there's no real mapping to document here
either, for the same "nothing real to check it against yet" reason as the
point-cloud gap above.
