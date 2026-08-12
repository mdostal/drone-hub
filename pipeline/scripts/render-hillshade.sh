#!/usr/bin/env bash
# render-hillshade.sh — DSM/DTM -> validated EPSG:3857 hillshade COG.
#
# This environment does not have the GDAL CLI tools installed (`which
# gdaldem` fails), so the raster-math step is delegated to the companion
# `render_hillshade.py` (rasterio/numpy), not `gdaldem`. If your environment
# DOES have GDAL installed, the direct GDAL-CLI equivalent of that step,
# per pipeline/README.md §2, is:
#
#   gdaldem hillshade -az 315 -alt 45 <input-dsm.tif> <hillshade_raw.tif>
#
# Both compute the same illumination model (slope/aspect hillshade,
# azimuth 315°/altitude 45° — this repo's established convention). After
# the raster-math step, this script runs the same reproject + re-COG +
# validate chain as reproject-ortho.sh:
#
#   rio warp   --dst-crs EPSG:3857 --resampling bilinear
#   rio cogeo create
#   rio cogeo validate
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage: render-hillshade.sh <input-dsm.tif> <output-hillshade.tif> [-- <extra render_hillshade.py args>]

Compute a slope/aspect hillshade from a DSM/DTM and produce a validated
EPSG:3857 Cloud-Optimized GeoTIFF.

  <input-dsm.tif>        Source elevation raster, any CRS (e.g. WebODM's
                          odm_dem/dsm.tif or odm_dem/dtm.tif).
  <output-hillshade.tif> Destination path for the final, validated
                          EPSG:3857 hillshade COG.

Extra arguments after `--` are forwarded to render_hillshade.py, e.g.:
  render-hillshade.sh dsm.tif hillshade.tif -- --az 315 --alt 45

Requires: `rio` (rasterio-cli + rio-cogeo) and `python3` (with rasterio,
numpy, scipy) on PATH.
EOF
}

if [[ $# -lt 2 ]]; then
  echo "error: expected at least 2 arguments, got $#" >&2
  usage
  exit 1
fi

INPUT="$1"
OUTPUT="$2"
shift 2

EXTRA_ARGS=()
if [[ $# -gt 0 ]]; then
  if [[ "$1" == "--" ]]; then
    shift
  fi
  EXTRA_ARGS=("$@")
fi

if [[ -z "$INPUT" || -z "$OUTPUT" ]]; then
  echo "error: input/output path must not be empty" >&2
  usage
  exit 1
fi

if [[ ! -f "$INPUT" ]]; then
  echo "error: input file not found: $INPUT" >&2
  exit 1
fi

if ! command -v rio >/dev/null 2>&1; then
  echo "error: 'rio' (rasterio-cli) not found on PATH — install with:" >&2
  echo "         pip install rasterio rio-cogeo" >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "error: 'python3' not found on PATH" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HILLSHADE_PY="$SCRIPT_DIR/render_hillshade.py"

if [[ ! -f "$HILLSHADE_PY" ]]; then
  echo "error: companion script not found: $HILLSHADE_PY" >&2
  exit 1
fi

OUTPUT_DIR="$(dirname "$OUTPUT")"
mkdir -p "$OUTPUT_DIR"

WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/render-hillshade.XXXXXX")"
cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

RAW_HILLSHADE="$WORKDIR/hillshade_raw.tif"
REPROJECTED="$WORKDIR/hillshade_3857.tif"

echo "==> [1/4] render_hillshade.py (rasterio/numpy slope-aspect hillshade, az=315 alt=45 unless overridden)" >&2
if ! python3 "$HILLSHADE_PY" "$INPUT" "$RAW_HILLSHADE" ${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"}; then
  echo "error: render_hillshade.py failed computing hillshade for '$INPUT'" >&2
  exit 1
fi

echo "==> [2/4] rio warp --dst-crs EPSG:3857 --resampling bilinear" >&2
if ! rio warp "$RAW_HILLSHADE" "$REPROJECTED" --dst-crs EPSG:3857 --resampling bilinear; then
  echo "error: rio warp failed reprojecting the computed hillshade" >&2
  exit 1
fi

echo "==> [3/4] rio cogeo create" >&2
if ! rio cogeo create "$REPROJECTED" "$OUTPUT"; then
  echo "error: rio cogeo create failed building '$OUTPUT'" >&2
  exit 1
fi

echo "==> [4/4] rio cogeo validate" >&2
if ! rio cogeo validate "$OUTPUT"; then
  echo "error: rio cogeo validate reported '$OUTPUT' is not a valid COG" >&2
  exit 1
fi

echo "==> done: $OUTPUT" >&2
