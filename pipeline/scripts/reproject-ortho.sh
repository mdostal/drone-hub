#!/usr/bin/env bash
# reproject-ortho.sh — reproject a georeferenced orthomosaic to EPSG:3857 and
# re-COG it, per pipeline/README.md §1's already-established convention:
#
#   rio warp   --dst-crs EPSG:3857 --resampling bilinear
#   rio cogeo create
#   rio cogeo validate
#
# WHY: <LayerViewer>'s COG loader (@geomatico/maplibre-cog-protocol)
# hardcodes a Web Mercator (EPSG:3857) assumption and silently mis-registers
# any COG that isn't already reprojected — see docs/components/land-overlay.md
# "Fixed" section for the real bug this fixes. A raw `rio warp` reproject
# alone isn't guaranteed to still be a valid Cloud-Optimized GeoTIFF, hence
# the re-COG + validate steps.
#
# Typical input: WebODM/ODM's odm_orthophoto/odm_orthophoto.tif (usually in
# a local UTM zone, not EPSG:3857).
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage: reproject-ortho.sh <input-ortho.tif> <output-ortho.tif>

Reproject a georeferenced orthomosaic to EPSG:3857 and re-COG it.

  <input-ortho.tif>   Source orthomosaic, any CRS (e.g. WebODM's
                       odm_orthophoto/odm_orthophoto.tif).
  <output-ortho.tif>  Destination path for the final, validated EPSG:3857
                       Cloud-Optimized GeoTIFF.

Requires: `rio` (rasterio-cli + rio-cogeo) on PATH.
EOF
}

if [[ $# -ne 2 ]]; then
  echo "error: expected exactly 2 arguments, got $#" >&2
  usage
  exit 1
fi

INPUT="$1"
OUTPUT="$2"

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

OUTPUT_DIR="$(dirname "$OUTPUT")"
mkdir -p "$OUTPUT_DIR"

WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/reproject-ortho.XXXXXX")"
cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

REPROJECTED="$WORKDIR/reprojected_3857.tif"

echo "==> [1/3] rio warp --dst-crs EPSG:3857 --resampling bilinear" >&2
if ! rio warp "$INPUT" "$REPROJECTED" --dst-crs EPSG:3857 --resampling bilinear; then
  echo "error: rio warp failed reprojecting '$INPUT' — is it a valid, readable raster?" >&2
  exit 1
fi

echo "==> [2/3] rio cogeo create" >&2
if ! rio cogeo create "$REPROJECTED" "$OUTPUT"; then
  echo "error: rio cogeo create failed building '$OUTPUT'" >&2
  exit 1
fi

echo "==> [3/3] rio cogeo validate" >&2
if ! rio cogeo validate "$OUTPUT"; then
  echo "error: rio cogeo validate reported '$OUTPUT' is not a valid COG" >&2
  exit 1
fi

echo "==> done: $OUTPUT" >&2
