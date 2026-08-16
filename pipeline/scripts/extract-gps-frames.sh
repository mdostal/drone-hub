#!/usr/bin/env bash
#
# extract-gps-frames.sh — pull still frames out of a DJI (or any GPS-tagged)
# video clip and write REAL GPS EXIF back onto each extracted JPEG frame.
#
# Why this exists (real failure mode this encodes a fix for):
#   A frame-extraction pass that just does `ffmpeg -vf fps=<rate>` produces
#   frames with NO position data at all. OpenDroneMap will still happily
#   reconstruct *relative* geometry from those frames via structure-from-
#   motion (feature matching doesn't need GPS) — but with zero absolute
#   position input it anchors the whole model at an arbitrary local origin.
#   That failure is real, checkable, and silent: the resulting orthophoto's
#   embedded CRS resolves to a nonsensical lat/lon nowhere near the actual
#   flight site, and `odm_report/stats.json` shows `"has_gps": false`. This
#   script's entire job is to make sure that never happens again: pull real
#   per-clip GPS out of the source video with `exiftool -ee -G3 -json -n`,
#   and stamp it onto every frame extracted from that clip *before* anything
#   gets handed to ODM.
#
# GPS extraction approach:
#   `-ee` (extract embedded) pulls embedded metadata tracks/documents out of
#   the video container, not just the top-level container tags. `-G3` groups
#   each extracted value by its source document (e.g. `Main:GPSLatitude` for
#   a single clip-level GPS tag, or `Doc12:GPSLatitude` / `Doc12:SampleTime`
#   for a per-sample telemetry track on footage that embeds one). `-json -n`
#   is NUMERIC mode — it returns GPSLatitude/GPSLongitude as plain signed
#   decimal degrees (e.g. -97.7081) instead of formatted DMS strings like
#   `97 deg 42' 29.16" W`. Numeric mode matters: parsing/re-embedding a DMS
#   string correctly (sign, hemisphere, degrees/minutes/seconds split) is a
#   real class of bug; numeric mode sidesteps it entirely by handing back
#   values that can be written straight back out with an explicit
#   GPS*Ref, no string parsing involved.
#
# Per-frame matching:
#   Some clips only carry a single clip-level GPS reading (`Main:GPSLatitude`
#   / `Main:GPSLongitude`, no per-sample timing) — every extracted frame
#   gets that one point. Clips that embed a real per-sample telemetry track
#   carry multiple `DocN:GPSLatitude` / `DocN:GPSLongitude` groups, each
#   paired with a `DocN:SampleTime` (seconds from clip start) — each
#   extracted frame is matched to whichever sample's SampleTime is closest
#   to that frame's own timestamp (frame index / fps). Either way, every
#   frame gets a real GPS point; this script refuses to hand out frames
#   with no GPS at all (see "no GPS found" below) rather than silently
#   repeating the has_gps:false failure mode above.
#
# Usage:
#   extract-gps-frames.sh <input-clip> <output-dir> [fps] [options]
#
# Positional args:
#   input-clip   Path to a DJI (or other GPS-tagged) video clip.
#   output-dir   Directory to write extracted+GPS-tagged JPEG frames into
#                (created if it doesn't exist).
#   fps          Frame extraction rate passed to `ffmpeg -vf fps=<rate>`.
#                Optional, default: 1. DJI nadir-grid docs from real jobs
#                have used 0.5-1fps — pick low enough that adjacent frames
#                still have enough photogrammetric overlap without wildly
#                over-sampling a multi-minute clip into tens of thousands
#                of near-duplicate frames.
#
# Options:
#   --allow-no-gps   Proceed even if NO GPS metadata is found anywhere in
#                     the source clip (frames are extracted ungeoreferenced).
#                     Off by default on purpose — see "no GPS found" below.
#   -h, --help        Print this usage and exit.
#
# Exit codes:
#   0  success
#   1  bad usage / missing input
#   2  missing required tool (ffmpeg / ffprobe / exiftool / python3)
#   3  no GPS metadata found in the source clip and --allow-no-gps not given
#
# Requires: ffmpeg, ffprobe, exiftool, python3 (all used only to parse the
# exiftool JSON and pick the nearest-in-time GPS sample per frame — no
# third-party python packages, stdlib json only).

set -euo pipefail

SCRIPT_NAME="$(basename "$0")"

usage() {
  sed -n '2,/^set -euo pipefail/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'
}

err() {
  echo "[$SCRIPT_NAME] ERROR: $*" >&2
}

info() {
  echo "[$SCRIPT_NAME] $*"
}

# ---------------------------------------------------------------------------
# Arg parsing
# ---------------------------------------------------------------------------

ALLOW_NO_GPS=0
POSITIONAL=()

while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    --allow-no-gps)
      ALLOW_NO_GPS=1
      shift
      ;;
    --)
      shift
      break
      ;;
    -*)
      err "unrecognized option: $1"
      usage
      exit 1
      ;;
    *)
      POSITIONAL+=("$1")
      shift
      ;;
  esac
done

# any remaining args after `--` are also positional
while [ $# -gt 0 ]; do
  POSITIONAL+=("$1")
  shift
done

if [ "${#POSITIONAL[@]}" -lt 2 ]; then
  err "missing required arguments"
  usage
  exit 1
fi

INPUT_CLIP="${POSITIONAL[0]}"
OUTPUT_DIR="${POSITIONAL[1]}"
FPS="${POSITIONAL[2]:-1}"

# ---------------------------------------------------------------------------
# Preflight
# ---------------------------------------------------------------------------

for tool in ffmpeg ffprobe exiftool python3; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    err "required tool '$tool' not found on PATH"
    exit 2
  fi
done

if [ ! -f "$INPUT_CLIP" ]; then
  err "input clip not found: $INPUT_CLIP"
  exit 1
fi

case "$FPS" in
  ''|*[!0-9.]*)
    err "fps must be a positive number, got: $FPS"
    exit 1
    ;;
esac

mkdir -p "$OUTPUT_DIR"

info "input clip:  $INPUT_CLIP"
info "output dir:  $OUTPUT_DIR"
info "extraction fps: $FPS"

WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/extract-gps-frames.XXXXXX")"
trap 'rm -rf "$WORK_DIR"' EXIT

GPS_JSON="$WORK_DIR/gps.json"
MAPPING_TSV="$WORK_DIR/mapping.tsv"

# ---------------------------------------------------------------------------
# 1. Pull GPS metadata out of the source clip
# ---------------------------------------------------------------------------

info "extracting embedded GPS metadata (exiftool -ee -G3 -json -n)..."
exiftool -ee -G3 -json -n "$INPUT_CLIP" > "$GPS_JSON"

# ---------------------------------------------------------------------------
# 2. Extract frames
# ---------------------------------------------------------------------------

info "extracting frames (ffmpeg -vf fps=$FPS)..."
ffmpeg -y -loglevel error -i "$INPUT_CLIP" -vf "fps=$FPS" -q:v 2 \
  "$OUTPUT_DIR/frame_%04d.jpg"

FRAME_COUNT="$(find "$OUTPUT_DIR" -maxdepth 1 -name 'frame_*.jpg' | wc -l | tr -d ' ')"
if [ "$FRAME_COUNT" -eq 0 ]; then
  err "ffmpeg produced no frames from $INPUT_CLIP"
  exit 1
fi
info "extracted $FRAME_COUNT frame(s)"

# ---------------------------------------------------------------------------
# 3. Build a frame -> (lat, latRef, lon, lonRef) mapping
#
#    Picks, per group in the exiftool JSON, any group that carries both
#    GPSLatitude and GPSLongitude. Groups that also carry a SampleTime are
#    treated as timed telemetry samples and matched to frames by nearest
#    timestamp (frame time = (frame_index - 1) / fps, matching ffmpeg's own
#    `fps=` filter sampling). If no timed samples exist at all (the common
#    case for a clip with only a single clip-level GPS reading), every frame
#    gets that one reading.
# ---------------------------------------------------------------------------

info "matching GPS samples to frames..."
MATCH_RC=0
python3 - "$GPS_JSON" "$OUTPUT_DIR" "$FPS" "$MAPPING_TSV" "$ALLOW_NO_GPS" <<'PYEOF' || MATCH_RC=$?
import json
import sys
import os
import glob

gps_json_path, output_dir, fps_str, mapping_path, allow_no_gps = sys.argv[1:6]
fps = float(fps_str)
allow_no_gps = allow_no_gps == "1"

with open(gps_json_path) as f:
    data = json.load(f)

if not data:
    print("no exiftool output for source clip", file=sys.stderr)
    sys.exit(3)

obj = data[0]

# group -> {"lat": float, "lon": float, "time": float or None}
groups = {}
for key, value in obj.items():
    if ":" not in key:
        continue
    group, tag = key.split(":", 1)
    g = groups.setdefault(group, {})
    if tag == "GPSLatitude":
        g["lat"] = value
    elif tag == "GPSLongitude":
        g["lon"] = value
    elif tag == "SampleTime":
        g["time"] = value

timed_samples = []   # (time, lat, lon)
untimed_samples = []  # (lat, lon)
for group, g in groups.items():
    if "lat" not in g or "lon" not in g:
        continue
    try:
        lat = float(g["lat"])
        lon = float(g["lon"])
    except (TypeError, ValueError):
        continue
    if "time" in g and g["time"] is not None:
        try:
            timed_samples.append((float(g["time"]), lat, lon))
            continue
        except (TypeError, ValueError):
            pass
    untimed_samples.append((lat, lon))

timed_samples.sort(key=lambda s: s[0])

if not timed_samples and not untimed_samples:
    msg = "no GPS metadata found anywhere in source clip (exiftool -ee -G3 -json -n found no GPSLatitude/GPSLongitude)"
    if allow_no_gps:
        print(f"WARNING: {msg} -- proceeding ungeoreferenced (--allow-no-gps)", file=sys.stderr)
        # write mapping with empty lat/lon so caller can detect and skip EXIF write
        frames = sorted(glob.glob(os.path.join(output_dir, "frame_*.jpg")))
        with open(mapping_path, "w") as out:
            for frame in frames:
                out.write(f"{frame}\t\t\t\t\n")
        sys.exit(0)
    else:
        print(f"ERROR: {msg}", file=sys.stderr)
        print("Refusing to produce ungeoreferenced frames (this is the exact", file=sys.stderr)
        print("has_gps:false failure mode this script exists to prevent).", file=sys.stderr)
        print("Pass --allow-no-gps to override and extract frames anyway.", file=sys.stderr)
        sys.exit(3)


def nearest(frame_time):
    if timed_samples:
        best = min(timed_samples, key=lambda s: abs(s[0] - frame_time))
        return best[1], best[2]
    # fall back to the first (or only) untimed sample -- applies the same
    # single clip-level GPS reading to every frame.
    return untimed_samples[0]


frames = sorted(glob.glob(os.path.join(output_dir, "frame_*.jpg")))
with open(mapping_path, "w") as out:
    for idx, frame in enumerate(frames):
        frame_time = idx / fps
        lat, lon = nearest(frame_time)
        lat_ref = "N" if lat >= 0 else "S"
        lon_ref = "E" if lon >= 0 else "W"
        out.write(f"{frame}\t{abs(lat)}\t{lat_ref}\t{abs(lon)}\t{lon_ref}\n")

print(
    f"{len(timed_samples)} timed GPS sample(s), {len(untimed_samples)} untimed sample(s) found; "
    f"{len(frames)} frame(s) matched",
    file=sys.stderr,
)
PYEOF

if [ "$MATCH_RC" -ne 0 ]; then
  if [ "$MATCH_RC" -eq 3 ]; then
    # No GPS found and --allow-no-gps wasn't given: don't leave ambiguous,
    # untagged frames sitting in the output dir for a caller to accidentally
    # feed to ODM (the exact has_gps:false footgun this script exists to
    # prevent) -- clean up what ffmpeg already extracted before failing.
    find "$OUTPUT_DIR" -maxdepth 1 -name 'frame_*.jpg' -exec rm -f {} +
    err "no GPS metadata found; removed $FRAME_COUNT untagged frame(s) from $OUTPUT_DIR"
  fi
  exit "$MATCH_RC"
fi

# ---------------------------------------------------------------------------
# 4. Write GPS EXIF back onto each frame
# ---------------------------------------------------------------------------

WROTE_ANY=0
SKIPPED_ANY=0
while IFS=$'\t' read -r FRAME LAT LATREF LON LONREF; do
  [ -z "$FRAME" ] && continue
  if [ -z "$LAT" ] || [ -z "$LON" ]; then
    SKIPPED_ANY=1
    continue
  fi
  exiftool -q -overwrite_original \
    -GPSLatitude="$LAT" -GPSLatitudeRef="$LATREF" \
    -GPSLongitude="$LON" -GPSLongitudeRef="$LONREF" \
    "$FRAME"
  WROTE_ANY=1
done < "$MAPPING_TSV"

if [ "$WROTE_ANY" -eq 1 ]; then
  info "wrote GPS EXIF onto $FRAME_COUNT frame(s) in $OUTPUT_DIR"
fi
if [ "$SKIPPED_ANY" -eq 1 ]; then
  info "WARNING: some/all frames left without GPS EXIF (--allow-no-gps was used and no GPS was found)"
fi

info "done."
