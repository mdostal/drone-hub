#!/usr/bin/env bash
# convert-mesh.sh — real ODM textured OBJ (+ .mtl + textures) -> compressed .glb
#
# Implements pipeline/README.md §3's obj2gltf/gltf-transform mapping, in the
# exact order this repo's own real v2 Prado mesh work found necessary:
#
#     obj2gltf (OBJ -> glb) -> gltf-transform resize (shrink textures)
#       -> [crop-mesh.py: crop + Y-up axis-correct -- see below]
#       -> gltf-transform draco (compress geometry, LAST)
#
# WHY THE ORDERING MATTERS (do not reorder without re-reading this):
# crop-mesh.py's per-material spatial crop + Y-up axis correction (see that
# script's own header comment for the full story) MUST run on the mesh
# BEFORE `gltf-transform draco` compresses it. crop-mesh.py's OBJ loader/
# exporter (trimesh) is not wired to decode already-Draco-compressed glTF
# geometry back out -- if draco ran first, crop-mesh.py would either fail to
# load the file's geometry at all or silently operate on stale/undecoded
# data. Draco must always be the LAST step in this chain.
#
# Because crop-mesh.py operates on the OBJ (not the glb) and obj2gltf is what
# actually needs to run first to prove the raw ODM output converts cleanly,
# this script supports two invocation shapes:
#
#   1. Full chain, no crop (pure nadir-grid capture, no off-property
#      outliers -- see crop-mesh.py's --no-crop / this story's
#      design_decisions for why cropping is opt-in, not automatic):
#        convert-mesh.sh <input.obj> <output.glb>
#
#   2. Full chain WITH crop-mesh.py's crop+axis-correct step, by pre-cropping
#      the OBJ yourself first, then feeding the cropped OBJ in as <input.obj>:
#        python3 crop-mesh.py raw.obj cropped.obj --x-min ... --x-max ...
#        convert-mesh.sh cropped.obj model.glb
#
# This keeps the two scripts genuinely separate (per the story's
# design_decisions: "Cropping is only needed for wide-sweep captures... let
# the manifest builder skip cropping when unnecessary") while still
# guaranteeing crop-before-draco whenever cropping IS used, since
# crop-mesh.py's own axis-correction step always runs on its output
# regardless of whether cropping was requested (see --no-crop).
#
# NOTE: crop-mesh.py ALSO applies the Y-up axis correction. If you skip
# crop-mesh.py entirely (e.g. quick-testing obj2gltf alone), the resulting
# glb will be in ODM's native Z-up orientation, not glTF's Y-up convention.
#
# Usage:
#   pipeline/scripts/convert-mesh.sh <input.obj> <output.glb> [texture-max-px]
#
# Requires: npx obj2gltf (verified 3.2.0), npx @gltf-transform/cli (verified
# 4.4.2 -- NOTE the package name is @gltf-transform/cli, not bare
# gltf-transform).

set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "usage: $0 <input.obj> <output.glb> [texture-max-px]" >&2
  echo "  input.obj        path to an OBJ (+ sibling .mtl + textures)," >&2
  echo "                   ideally already cropped/axis-corrected by" >&2
  echo "                   crop-mesh.py -- see this script's header comment" >&2
  echo "  output.glb       path to write the final, Draco-compressed .glb" >&2
  echo "  texture-max-px   optional max width/height for gltf-transform" >&2
  echo "                   resize (default: 1024)" >&2
  exit 1
fi

INPUT_OBJ="$1"
OUTPUT_GLB="$2"
TEXTURE_MAX_PX="${3:-1024}"

if [[ ! -f "$INPUT_OBJ" ]]; then
  echo "error: input OBJ not found: $INPUT_OBJ" >&2
  exit 1
fi

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

RAW_GLB="$WORKDIR/01-raw.glb"
RESIZED_GLB="$WORKDIR/02-resized.glb"

echo "==> [1/3] obj2gltf: $INPUT_OBJ -> $RAW_GLB"
npx obj2gltf -i "$INPUT_OBJ" -o "$RAW_GLB"

echo "==> [2/3] gltf-transform resize (max ${TEXTURE_MAX_PX}px): $RAW_GLB -> $RESIZED_GLB"
npx @gltf-transform/cli resize --width "$TEXTURE_MAX_PX" --height "$TEXTURE_MAX_PX" "$RAW_GLB" "$RESIZED_GLB"

# --- Y-up axis correction happens HERE in the pipeline, but it is NOT run by
# this script. crop-mesh.py performs both the spatial crop AND the Y-up axis
# correction, on the OBJ, before obj2gltf ever runs (see this script's header
# comment). If <input.obj> was produced by crop-mesh.py, the axis correction
# has already happened by the time we get here. This script's job is only
# the glb-side of the chain: convert, resize, then Draco-compress last.

mkdir -p "$(dirname "$OUTPUT_GLB")"

echo "==> [3/3] gltf-transform draco (final compression, MUST be last): $RESIZED_GLB -> $OUTPUT_GLB"
npx @gltf-transform/cli draco "$RESIZED_GLB" "$OUTPUT_GLB"

echo "==> done: $OUTPUT_GLB"
ls -lh "$OUTPUT_GLB"
