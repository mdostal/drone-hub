---
name: run-pipeline
description: Orchestrate drone-hub's raw-footage-to-property-manifest pipeline end-to-end — GPS-tag frame extraction, OpenDroneMap reconstruction, ortho/hillshade/contour/mesh derivation, and final layers.json/model.json assembly — by sequencing the real, already-built scripts under pipeline/scripts/ in the correct dependency order and surfacing their real progress/errors (including run-odm.sh's Docker-memory preflight failure and whole-directory-wipe-on-rerun behavior) instead of swallowing them. Use when asked to "run a property through the pipeline," "process this drone footage," "turn these clips into a layers.json," or similar — for a single property, given a directory of raw clips and a slug.
---

# run-pipeline

A thin orchestrator over the six real scripts in `pipeline/scripts/`. It
sequences them correctly for one property and relays each script's own
output — it does not reimplement any of their logic (GPS matching, Docker
safety checks, raster math, mesh cropping, manifest field defaults all stay
exactly where they already live, in the scripts). If a step here disagrees
with what its script's own `--help`/header comment says, the script is
authoritative — re-read it rather than trusting a stale copy of a flag here.

## What this does NOT automate

- **Flying the drone.** Capturing the nadir grid pass(es) — and, if the
  property has tall vertical structures (trees, multi-story elements) that
  a straight-down camera can't see the sides of, an oblique orbit pass — is
  entirely manual, before this skill ever runs.
- **Judging which raw clips are usable.** A raw footage folder from a real
  flight is not automatically "the nadir grid clips plus maybe an orbit
  clip" — it can include misfires, transit/repositioning clips, clips shot
  at the wrong altitude, or clips of the wrong property entirely. Figuring
  out *which* clips in `00_raw/` are the real nadir-grid pass(es) and
  whether an oblique-orbit clip exists and is usable — "how do we part out
  the correct clips" — is a real judgment call this skill does not make.
  Hand it the clips you've already decided are the right ones.
- **Deciding reconstruction quality settings.** `run-odm.sh` passes ODM's
  own flags (`--pc-quality`, `--feature-quality`, `--use-3dmesh`, `--dsm`,
  `--dtm`, etc.) through verbatim; this skill doesn't pick defaults for you.
- **Deciding mesh crop bounds.** If a capture needs cropping (see Step 3c),
  the real-world or local-frame bounding box is a judgment call about where
  the property actually ends — this skill sequences `crop-mesh.py`, it
  doesn't compute bounds for you.
- **Sourcing the parcel boundary GeoJSON.** Per CLAUDE.md, that comes from
  the operator's own parcel tool, not from anything ODM produces. Supply it
  yourself (or omit `--boundary` from Step 4 if you don't have one yet —
  `build-manifest.py` treats it as independently optional).
- **Choosing a `--geo-anchor` lat/lon for `<LandOverlay>`.** If you want the
  final mesh anchored into `<LayerViewer>`'s georeferenced map context
  (`lib/geo-model-types.ts`'s `GeoAnchoredModel`), that real-world anchor
  point is your call, not something this skill infers from the mesh.

## Prerequisites

- `ffmpeg`, `ffprobe`, `exiftool`, `python3` on `PATH` (Step 1).
- `docker`, running and accessible, with its memory allocation actually
  raised — Docker Desktop's *default* (≈7.65GB) is under `run-odm.sh`'s own
  16GB floor and will fail the preflight (Step 2).
- `rio` (`pip install rasterio rio-cogeo`) plus `python3` with `rasterio`,
  `numpy`, `scikit-image`, `trimesh`, `pyproj` importable (Step 3).
- `npx` able to reach `obj2gltf` and `@gltf-transform/cli` (Step 3d).

## Step 1 — GPS-tagged frame extraction (per clip)

Run `extract-gps-frames.sh` **once per raw clip** — every nadir-pass clip,
and the oblique-orbit clip too if the property has one. Each invocation
writes `frame_0001.jpg`, `frame_0002.jpg`, … into its own output directory,
so give every clip its own subdirectory (the numbering restarts per clip and
would silently collide/overwrite if two clips shared one output dir):

```sh
for clip in raw/DJI_..._0020_D.MP4 raw/DJI_..._0022_D.MP4; do
  name="$(basename "$clip" .MP4)"
  pipeline/scripts/extract-gps-frames.sh "$clip" "work/frames/$name" 1
done
# oblique orbit clip, if the property has one — a lower fps is typical for a
# multi-minute circling pass (this repo's own real job used 0.5fps for a
# ~3min orbit clip vs 1fps for the shorter nadir passes):
pipeline/scripts/extract-gps-frames.sh raw/DJI_..._0023_D.MP4 work/frames/0023 0.5
```

Then merge every clip's frames into **one flat combined directory**, since
`run-odm.sh --images` expects a single directory and ODM reconstructs from
one unified image set regardless of which clip a frame came from — reuse
each clip's own subdirectory name as a filename prefix so frames from
different clips can never collide once merged:

```sh
mkdir -p work/combined-images
for dir in work/frames/*/; do
  clip="$(basename "$dir")"
  for f in "$dir"frame_*.jpg; do
    cp "$f" "work/combined-images/${clip}_$(basename "$f")"
  done
done
```

**Watch for exit code 3** ("no GPS metadata found... Refusing to produce
ungeoreferenced frames") — this is the script actively preventing the
`has_gps: false` silent-misregistration failure (see the script's own header
comment), not a bug to work around. Don't reach for `--allow-no-gps` to make
it go away; a clip with no embedded GPS needs a real fix (wrong export
settings, stripped metadata) before it belongs in this pipeline at all.

## Step 2 — ODM reconstruction

One call, on the combined image set from Step 1:

```sh
pipeline/scripts/run-odm.sh \
  --project-dir work/odm-project \
  --images work/combined-images \
  -- --pc-quality high --feature-quality high --use-3dmesh --dsm --dtm
```

Two real, hard-won behaviors this script enforces — **surface both to
whoever is running this skill, verbatim, never swallow them**:

- **Docker-memory preflight (exit code 3).** Before starting, the script
  queries `docker info` and refuses to run at all if Docker's allocated
  memory is under 16GB (overridable via `--min-memory-gb`). This is not
  a false-positive check to bypass — it's standing in for a real failure
  mode already hit on this exact job (`DensifyPointCloud`/openmvs
  segfaulting hours into a run under x86-on-ARM64 emulation with too little
  memory, see `pipeline/scripts/run-odm.sh`'s header and
  `~/Desktop/drone-jobs/2026-08-08_prado_flight2/05_ortho/README.md`). If
  this fails, the fix is raising Docker Desktop's memory allocation (Docker
  Desktop → Settings → Resources → Memory), not `--skip-memory-check` —
  reach for that flag only with a specific reason to believe this host
  doesn't need the floor (e.g. native-arch Docker, not emulation).
- **Whole-directory wipe on rerun (exit code 4 if declined).** If
  `work/odm-project` already exists and its `images/` contents differ from
  what's being fed in this run, the script wipes the **entire** project
  directory — not selective cache files — before repopulating. This is
  deliberate: selectively deleting only some of ODM's dataset-stage cache
  files leaves it in a broken `FileNotFoundError` state on `img_list.txt`
  rather than cleanly rescanning. It prompts for confirmation unless
  `--force` is passed. When running this skill unattended, decide up front
  whether wiping stale output is actually intended before passing
  `--force` — don't pass it reflexively just to avoid the prompt.

`--dry-run` is worth running first if there's any doubt about the resulting
`docker run` invocation, the memory check result, or whether a wipe will
trigger — it reports all three without touching disk or invoking Docker.

ODM's own output lands in `work/odm-project/` with the standard layout
(`odm_orthophoto/`, `odm_dem/`, `odm_georeferencing/`, `odm_texturing/`,
`odm_report/`) — Step 3 reads directly from there.

## Step 3 — Raster + mesh derivation (independent of each other; any order, in parallel if convenient)

Everything in this step reads only from ODM's Step 2 output and writes
independent output files — none of these four sub-steps depend on each
other, only on Step 2 having finished.

### 3a. Ortho

```sh
pipeline/scripts/reproject-ortho.sh \
  work/odm-project/odm_orthophoto/odm_orthophoto.tif \
  out/ortho.tif
```

### 3b. Hillshade (from the DSM)

```sh
pipeline/scripts/render-hillshade.sh \
  work/odm-project/odm_dem/dsm.tif \
  out/hillshade.tif
```

### 3c. Contours (from the same DSM)

```sh
python3 pipeline/scripts/extract-contours.py \
  work/odm-project/odm_dem/dsm.tif \
  out/contours.geojson
```

`--interval`/`--simplify-tolerance`/`--min-points` all have sane defaults
(2.5, 1.0, 2) matching this repo's existing sample data — only override them
if the property's terrain is unusually flat or steep.

### 3d. Mesh: crop (optional, skip gracefully) → convert

`crop-mesh.py` always applies the Y-up axis correction glTF/three.js expect
— it does **not** run in `convert-mesh.sh`, so this step can't be skipped
outright, but the *cropping itself* is opt-in and skips cleanly:

- **Pure nadir-grid capture, no oblique-orbit/off-property-outlier
  concern** — the common case, and the one a nadir-only property must not
  error on: pass `--no-crop`. Cropping is a no-op, axis correction still
  happens.

  ```sh
  python3 pipeline/scripts/crop-mesh.py \
    work/odm-project/odm_texturing/odm_textured_model_geo.obj \
    work/mesh-axis-corrected.obj \
    --no-crop
  ```

- **Wide-sweep capture (oblique orbit reconstructed real geometry from
  neighboring parcels/street/sky)** — crop to the property's real bounds
  first, via either local mesh-frame bounds or a lat/lon box reprojected
  through the ODM project's own `odm_georeferencing/coords.txt`:

  ```sh
  python3 pipeline/scripts/crop-mesh.py \
    work/odm-project/odm_texturing/odm_textured_model_geo.obj \
    work/mesh-axis-corrected.obj \
    --lat-min <…> --lat-max <…> --lon-min <…> --lon-max <…> \
    --coords-txt work/odm-project/odm_georeferencing/coords.txt
  ```

Either way, feed the result into `convert-mesh.sh` — **Draco compression
must run last**, which is exactly what this script does (`obj2gltf` → resize
→ Draco); do not reorder or call `gltf-transform draco` before this:

```sh
pipeline/scripts/convert-mesh.sh work/mesh-axis-corrected.obj out/model.glb
```

## Step 4 — Manifest assembly

Once whichever of Step 3's outputs actually exist are in hand (each is
independently optional to `build-manifest.py` — pass only what you have):

```sh
python3 pipeline/scripts/build-manifest.py <slug> "<Title>" \
  --output-dir out \
  --ortho out/ortho.tif \
  --hillshade out/hillshade.tif \
  --boundary <parcel-boundary.geojson> \
  --contours out/contours.geojson \
  --mesh out/model.glb
```

Add `--geo-anchor <lat> <lon>` (plus optionally `--altitude-meters`,
`--rotation-degrees`, `--scale`) to emit a `GeoAnchoredModel`
(`lib/geo-model-types.ts`) instead of a plain `ModelDef` — only do this if
you actually want the mesh composited into `<LayerViewer>`/`<LandOverlay>`'s
map context at a real-world position; otherwise leave it off and
`build-manifest.py` writes a plain `ModelDef` for standalone `<Model3D>` use.

This writes `out/layers.json` (always, given at least one of
`--ortho`/`--hillshade`/`--boundary`/`--contours`, or the default thermal
stub slot) and `out/model.json` (only if `--mesh` was given) — a complete
property manifest, in the same shape `<LayerViewer>`/`<Model3D>` already
consume from `public/layer-viewer-samples/<slug>/` and
`public/model3d-samples/<slug>/`.

## What was actually tested

**Steps 3–4 (raster/mesh/manifest) were run for real** against the real,
already-produced v2 ODM output at
`~/Desktop/drone-jobs/2026-08-08_prado_flight2/05_ortho/v2/odm-full-output/`
— `reproject-ortho.sh` on the real `odm_orthophoto.tif`, `render-hillshade.sh`
and `extract-contours.py` on the real `dsm.tif`, `crop-mesh.py --no-crop`
(the nadir-only graceful-skip path) followed by `convert-mesh.sh` on the
real 37-material textured OBJ (149,068 vertices), then `build-manifest.py`
wiring all four outputs plus the real sample `parcel.geojson` into a
`layers.json`/`model.json` pair. All five commands succeeded; the resulting
`layers.json` is structurally identical (same keys, same field order, same
5 layers) to the shipped reference manifest at
`public/layer-viewer-samples/2806-prado/layers.json`, and `model.json`
matched `ModelDef`'s shape. This also concretely confirms the
graceful-skip-when-no-oblique-clip path: `crop-mesh.py --no-crop` ran clean
with no bounds supplied, applied only the Y-up correction, and
`convert-mesh.sh` produced a valid `model.glb` from its output — nothing
in that chain requires crop bounds to exist for a nadir-only property.

**Steps 1–2 (GPS extraction + the actual ODM docker run) were validated by
inspection of the scripts' own documented CLI contracts only** — reading
`extract-gps-frames.sh`/`run-odm.sh` in full to confirm the invocations
above match their real usage, positional args, flags, and exit codes — not
a live end-to-end run. Running `extract-gps-frames.sh` against real raw
clips and `run-odm.sh` against the resulting frames (a genuine multi-hour
reconstruction) is real, un-covered work for whenever this skill is next
exercised against fresh raw footage — the same "not tested with a live
multi-hour ODM run" caveat `run-odm.sh`'s own story already carries.
