#!/usr/bin/env bash
#
# run-odm.sh — a docker wrapper around OpenDroneMap's CLI
# (`opendronemap/odm` image) with two real, hard-won safety behaviors baked
# in as actual preflight/rerun GUARDS, not comments someone could skip:
#
#   1. Docker memory preflight. A multi-hour ODM run that segfaults
#      partway through `DensifyPointCloud` because Docker Desktop's memory
#      allocation is too small is a real failure mode that has been hit for
#      real (x86-on-ARM64 emulation under tight memory made
#      openmvs/DensifyPointCloud crash, with a "camera directions mean is
#      unbalanced" warning right before it). This script queries Docker's
#      OWN reported memory allocation via `docker info` and refuses to start
#      the run at all if it's under a floor (default 16GB, overridable) --
#      failing loudly, in seconds, before a run that could otherwise burn
#      hours before crashing.
#
#   2. Whole-directory wipe on rerun with a changed image set. Selectively
#      deleting ODM's dataset-stage cache files (img_list.txt, images.json,
#      etc.) between reruns leaves the project directory in a broken state
#      -- a `FileNotFoundError` on img_list.txt instead of a clean rescan.
#      This script detects when the target project directory already
#      exists AND its images/ contents differ from what's being fed in for
#      this run, and if so wipes the ENTIRE project directory (not select
#      cache files) before repopulating images/ and starting fresh.
#
# ODM's own reconstruction-quality flags (--pc-quality, --feature-quality,
# --use-3dmesh, --dsm, --dtm, --rerun-from, etc.) are accepted as PASSTHROUGH
# arguments -- this script wraps the docker invocation, it does not decide
# reconstruction settings.
#
# Usage:
#   run-odm.sh --project-dir <dir> --images <dir> [options] [-- <odm-flags>...]
#
# Required:
#   --project-dir <dir>   The ODM project directory (the directory that
#                          contains, or will contain, an `images/`
#                          subdirectory -- this is what gets mounted into
#                          the odm container and is where ODM writes all of
#                          its output). Does not need to exist yet.
#   --images <dir>         Directory containing the prepared, GPS-tagged
#                          input images for this run (e.g. the output of
#                          extract-gps-frames.sh). Copied into
#                          <project-dir>/images/.
#
# Options:
#   --min-memory-gb <N>    Docker memory floor, in GB. Default: 16 (a real
#                           finding from this session's x86-on-ARM64 setup,
#                           not a guaranteed-universal number -- override
#                           for a different host).
#   --odm-image <name>     Docker image to run. Default: opendronemap/odm
#   --force                Skip the wipe confirmation prompt AND the
#                           memory-preflight prompt-equivalent: still fails
#                           loudly on an under-floor memory allocation
#                           (that check is never skippable by --force --
#                           see "What --force does NOT do" below), but
#                           auto-confirms the destructive directory wipe.
#   --skip-memory-check     Explicitly bypass the memory preflight. Separate
#                           from --force on purpose -- see below.
#   --dry-run               Print what would happen (memory check result,
#                           wipe decision, final docker command) without
#                           actually deleting anything or invoking docker.
#   -h, --help               Print this usage and exit.
#
# What --force does NOT do:
#   --force only auto-confirms the destructive directory-wipe prompt. It
#   does NOT bypass the memory preflight -- that check fails the script
#   outright regardless of --force, on purpose (a segfault hours into a run
#   is a much more expensive failure than a script exiting early). Use
#   --skip-memory-check if you specifically want to bypass the memory floor
#   (e.g. testing, or a host you know reports memory differently).
#
# Everything after the recognized options above -- and everything after a
# literal `--` -- is passed through verbatim to the odm CLI inside the
# container, e.g.:
#
#   run-odm.sh --project-dir ~/jobs/my-property --images ~/jobs/my-property-frames \
#     -- --pc-quality high --feature-quality high --use-3dmesh --dsm --dtm
#
# Exit codes:
#   0  success (or, with --dry-run, a clean dry-run)
#   1  bad usage / missing input
#   2  missing required tool (docker)
#   3  Docker's allocated memory is under the floor
#   4  wipe declined interactively
#
# Requires: docker (running and accessible). rsync used if present for the
# images/ copy step, falling back to `cp -R` otherwise.

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

PROJECT_DIR=""
IMAGES_DIR=""
MIN_MEMORY_GB=16
ODM_IMAGE="opendronemap/odm"
FORCE=0
SKIP_MEMORY_CHECK=0
DRY_RUN=0
PASSTHROUGH=()

while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    --project-dir)
      PROJECT_DIR="${2:-}"
      shift 2
      ;;
    --images)
      IMAGES_DIR="${2:-}"
      shift 2
      ;;
    --min-memory-gb)
      MIN_MEMORY_GB="${2:-}"
      shift 2
      ;;
    --odm-image)
      ODM_IMAGE="${2:-}"
      shift 2
      ;;
    --force)
      FORCE=1
      shift
      ;;
    --skip-memory-check)
      SKIP_MEMORY_CHECK=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --)
      shift
      while [ $# -gt 0 ]; do
        PASSTHROUGH+=("$1")
        shift
      done
      ;;
    *)
      # Anything unrecognized is passed straight through to the odm CLI --
      # this script must not hardcode/gate ODM's own flag set.
      PASSTHROUGH+=("$1")
      shift
      ;;
  esac
done

if [ -z "$PROJECT_DIR" ] || [ -z "$IMAGES_DIR" ]; then
  err "--project-dir and --images are both required"
  usage
  exit 1
fi

case "$MIN_MEMORY_GB" in
  ''|*[!0-9]*)
    err "--min-memory-gb must be a positive integer, got: $MIN_MEMORY_GB"
    exit 1
    ;;
esac

if ! command -v docker >/dev/null 2>&1; then
  err "required tool 'docker' not found on PATH"
  exit 2
fi

if [ ! -d "$IMAGES_DIR" ]; then
  err "--images directory not found: $IMAGES_DIR"
  exit 1
fi

# ---------------------------------------------------------------------------
# 1. Docker memory preflight -- fail loudly BEFORE starting a multi-hour run
# ---------------------------------------------------------------------------

MIN_MEMORY_BYTES=$((MIN_MEMORY_GB * 1024 * 1024 * 1024))

if [ "$SKIP_MEMORY_CHECK" -eq 1 ]; then
  info "memory preflight SKIPPED (--skip-memory-check)"
else
  info "checking Docker's allocated memory (floor: ${MIN_MEMORY_GB}GB)..."
  if ! DOCKER_MEM_BYTES="$(docker info --format '{{.MemTotal}}' 2>/dev/null)"; then
    err "could not query docker info -- is Docker running and accessible?"
    exit 2
  fi
  case "$DOCKER_MEM_BYTES" in
    ''|*[!0-9]*)
      err "docker info returned a non-numeric MemTotal: '$DOCKER_MEM_BYTES'"
      exit 2
      ;;
  esac

  DOCKER_MEM_GB_DISPLAY=$(awk "BEGIN { printf \"%.1f\", $DOCKER_MEM_BYTES / 1073741824 }")

  if [ "$DOCKER_MEM_BYTES" -lt "$MIN_MEMORY_BYTES" ]; then
    err "Docker's allocated memory (${DOCKER_MEM_GB_DISPLAY}GB) is under the ${MIN_MEMORY_GB}GB floor."
    err ""
    err "A dense-reconstruction ODM run under this little memory is a real,"
    err "previously-hit failure mode: it does not fail fast -- it runs for"
    err "hours and then segfaults partway through DensifyPointCloud (openmvs),"
    err "often preceded by a 'camera directions mean is unbalanced' warning."
    err ""
    err "Fix: raise Docker Desktop's memory allocation --"
    err "  Docker Desktop -> Settings -> Resources -> Memory -- to at least"
    err "  ${MIN_MEMORY_GB}GB, then re-run this script."
    err "Or: pass --min-memory-gb <N> to change the floor (only do this if"
    err "  you have a specific reason to believe this host doesn't need"
    err "  ${MIN_MEMORY_GB}GB -- e.g. native-architecture Docker instead of"
    err "  x86-on-ARM64 emulation), or --skip-memory-check to bypass entirely."
    exit 3
  fi

  info "Docker memory OK: ${DOCKER_MEM_GB_DISPLAY}GB >= ${MIN_MEMORY_GB}GB floor"
fi

# ---------------------------------------------------------------------------
# 2. Whole-directory-wipe-on-rerun
#
#    Fingerprint the incoming --images directory and (if it exists) the
#    existing <project-dir>/images/ directory by hashing a sorted
#    (filename, sha256) manifest of each. If the project directory doesn't
#    exist yet, or exists but its images/ fingerprint differs from the
#    incoming one, wipe the ENTIRE project directory (never select cache
#    files) and repopulate images/ from scratch.
# ---------------------------------------------------------------------------

fingerprint_dir() {
  # Prints a single sha256 fingerprint of a directory's immediate files
  # (basename + content hash of each, sorted by basename) or nothing if the
  # directory doesn't exist / is empty. Deliberately hashes basename, NOT
  # full path -- --images and <project-dir>/images are different absolute
  # paths by construction, so hashing full paths would make the fingerprint
  # of identical content always differ and trigger a wipe every single run.
  dir="$1"
  if [ ! -d "$dir" ]; then
    return 0
  fi
  find "$dir" -maxdepth 1 -type f -print0 2>/dev/null \
    | sort -z \
    | while IFS= read -r -d '' f; do
        h="$(shasum -a 256 "$f" | awk '{print $1}')"
        printf '%s  %s\n' "$h" "$(basename "$f")"
      done \
    | shasum -a 256 \
    | awk '{print $1}'
}

NEW_FINGERPRINT="$(fingerprint_dir "$IMAGES_DIR")"
if [ -z "$NEW_FINGERPRINT" ]; then
  err "--images directory is empty or unreadable: $IMAGES_DIR"
  exit 1
fi

NEEDS_WIPE=0
WIPE_REASON=""

if [ -d "$PROJECT_DIR" ]; then
  EXISTING_FINGERPRINT="$(fingerprint_dir "$PROJECT_DIR/images")"
  if [ ! -d "$PROJECT_DIR/images" ]; then
    NEEDS_WIPE=1
    WIPE_REASON="project directory exists but has no images/ subdirectory (malformed/partial state)"
  elif [ "$EXISTING_FINGERPRINT" != "$NEW_FINGERPRINT" ]; then
    NEEDS_WIPE=1
    WIPE_REASON="existing images/ content differs from the incoming --images set"
  else
    info "project directory's images/ already match the incoming --images set -- keeping existing project directory (and any cached ODM stage output) as-is"
  fi
else
  info "project directory does not exist yet -- will create it fresh"
fi

if [ "$NEEDS_WIPE" -eq 1 ]; then
  info "REBUILD REQUIRED: $WIPE_REASON"
  info "This will DELETE the entire project directory (all ODM stage cache"
  info "AND any prior reconstruction output), not just selected cache files:"
  info "  $PROJECT_DIR"
  if [ "$DRY_RUN" -eq 1 ]; then
    info "[dry-run] would wipe $PROJECT_DIR and repopulate images/ from $IMAGES_DIR"
  else
    if [ "$FORCE" -ne 1 ]; then
      printf "Proceed with wiping the whole directory? [y/N] " >&2
      read -r REPLY
      case "$REPLY" in
        y|Y|yes|YES) ;;
        *)
          err "wipe declined -- aborting without touching $PROJECT_DIR"
          exit 4
          ;;
      esac
    fi
    rm -rf "$PROJECT_DIR"
    mkdir -p "$PROJECT_DIR/images"
    if command -v rsync >/dev/null 2>&1; then
      rsync -a "$IMAGES_DIR"/ "$PROJECT_DIR/images"/
    else
      cp -R "$IMAGES_DIR"/. "$PROJECT_DIR/images"/
    fi
    info "wiped and repopulated $PROJECT_DIR/images/ from $IMAGES_DIR"
  fi
elif [ ! -d "$PROJECT_DIR" ]; then
  if [ "$DRY_RUN" -eq 1 ]; then
    info "[dry-run] would create $PROJECT_DIR/images/ and populate it from $IMAGES_DIR"
  else
    mkdir -p "$PROJECT_DIR/images"
    if command -v rsync >/dev/null 2>&1; then
      rsync -a "$IMAGES_DIR"/ "$PROJECT_DIR/images"/
    else
      cp -R "$IMAGES_DIR"/. "$PROJECT_DIR/images"/
    fi
    info "created $PROJECT_DIR/images/ from $IMAGES_DIR"
  fi
fi

# ---------------------------------------------------------------------------
# 3. Invoke ODM's docker CLI
#
#    Standard ODM docker invocation mounts the project directory's PARENT
#    at /datasets and passes the project directory's own basename as the
#    project name (see https://docs.opendronemap.org):
#      docker run -ti --rm -v <parent>:/datasets opendronemap/odm \
#        --project-path /datasets <project-name> <passthrough odm flags>
# ---------------------------------------------------------------------------

# Resolve an absolute path for the project directory WITHOUT requiring it
# to already exist -- in --dry-run (or a brand-new project) it may not have
# been created yet at this point.
if [ -d "$PROJECT_DIR" ]; then
  PROJECT_DIR_ABS="$(cd "$PROJECT_DIR" && pwd)"
else
  PARENT_DIR="$(dirname "$PROJECT_DIR")"
  BASE_NAME="$(basename "$PROJECT_DIR")"
  if [ -d "$PARENT_DIR" ]; then
    PROJECT_DIR_ABS="$(cd "$PARENT_DIR" && pwd)/$BASE_NAME"
  else
    case "$PROJECT_DIR" in
      /*) PROJECT_DIR_ABS="$PROJECT_DIR" ;;
      *) PROJECT_DIR_ABS="$(pwd)/$PROJECT_DIR" ;;
    esac
  fi
fi
DATASETS_PARENT="$(dirname "$PROJECT_DIR_ABS")"
PROJECT_NAME="$(basename "$PROJECT_DIR_ABS")"

DOCKER_CMD=(docker run -ti --rm -v "$DATASETS_PARENT:/datasets" "$ODM_IMAGE" \
  --project-path /datasets "$PROJECT_NAME")
if [ "${#PASSTHROUGH[@]}" -gt 0 ]; then
  DOCKER_CMD+=("${PASSTHROUGH[@]}")
fi

info "odm invocation:"
printf '  %q' "${DOCKER_CMD[@]}" >&2
printf '\n' >&2

if [ "$DRY_RUN" -eq 1 ]; then
  info "[dry-run] not invoking docker"
  exit 0
fi

exec "${DOCKER_CMD[@]}"
