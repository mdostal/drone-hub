#!/usr/bin/env python3
"""detect-coverage-gaps.py -- find real, unreconstructed holes in a textured
ODM mesh and map each one back to an approximate real-world lat/lon +
compass direction, so a follow-up flight knows roughly where to point the
camera.

Why this exists (see .pHive/epics/mesh-quality-and-terrain-pipeline/stories/
coverage-gap-detector.yaml): the operator's real Prado v2 reconstruction has
visible holes where photogrammetry failed (occlusion, insufficient camera
overlap on some surface). `components/FlightCoverageAnalyzer` already judges
whether *flight telemetry* forms a valid overlapping grid -- a pre-flight/
post-flight-log sanity check. This script is a different, later-stage tool:
it looks at the *reconstructed mesh itself* and finds where the reconstruction
came up empty, which telemetry-only analysis cannot show (a flight can have
perfect nominal overlap and still fail to reconstruct a patch of ground the
camera never got a clean line of sight to, e.g. under a dense tree canopy).

WHAT THIS TOOL DELIBERATELY DOES NOT DO (read before trusting a report):
it does NOT claim to know WHY a gap exists. A flagged region might be real
occlusion (tree canopy, a shadowed eave), might be a genuinely flat/textureless
surface photogrammetry struggles with (a plain painted wall, still water), or
might be an artifact of the analysis window's own edge. This script reports
location and size, honestly, and leaves the "why, and is a re-flight worth it"
judgment to whoever reads the report -- per this story's own acceptance
criteria and the epic's design-discussion risk table.

TECHNIQUE REUSE -- lat/lon reprojection (read crop-mesh.py first):
ODM's georeferenced OBJ output is in meters *local* to an arbitrary per-project
origin recorded in that project's own `odm_georeferencing/coords.txt` (UTM
zone/datum on line 1, easting/northing offset on line 2 -- see crop-mesh.py's
own module docstring for the full explanation and a real example). This
script does NOT reinvent that parsing/reprojection -- it dynamically imports
crop-mesh.py (a sibling script in this same directory) at runtime and reuses
its `parse_coords_txt()` / `utm_epsg_from_zone_desc()` / (for lat-lon-bounds
input) `local_bounds_from_lat_lon()` functions directly, then applies the
exact inverse of that same offset math to reproject gap centroids/footprints
from local mesh meters back to real lat/lon. One UTM-offset technique, reused
in both directions, not two implementations that can drift apart.

ALGORITHM
1. Load the mesh (a multi-material `trimesh.Scene`, same loader crop-mesh.py
   uses) and collect every face's centroid (x, y) in the mesh's local frame.
2. Restrict analysis to a real-world area of interest (AOI) -- either given
   directly in local meters (--x-min/--x-max/--y-min/--y-max), given as
   lat/lon (--lat-min/--lat-max/--lon-min/--lon-max, reprojected into the
   mesh's local frame via --coords-txt, the same technique crop-mesh.py's own
   --lat-lon-bounds mode uses), or explicitly the mesh's own full real vertex
   extent (--full-extent). An AOI is required (one of the above) -- silently
   defaulting to the full extent would flood the report with meaningless
   "gaps" out past the property line (street, sky, a neighboring parcel a
   wide oblique-orbit capture also reconstructs a sliver of -- see
   crop-mesh.py's own docstring on why that outlier geometry exists at all).
3. Rasterize the AOI into a 2D grid of square cells (a cell is "covered" if
   at least one face centroid falls in it) at a resolution DERIVED from the
   AOI's own real extent, not a guessed fixed pixel count -- see
   `derive_cell_size_m()`.
4. Run `scipy.ndimage.label` on the *uncovered* cells to find connected empty
   regions, drop any region touching the AOI's own border (that is the edge
   of the analysis window, or the edge of the capture footprint -- not a real
   interior hole this analysis can characterize), and drop any region below
   an empirically-tuned minimum area (single/double-cell gaps are texture-
   density noise at this mesh's real face density -- see
   `DEFAULT_MIN_GAP_AREA_M2` below for the empirical tuning that produced
   this default).
5. For each surviving gap: compute its centroid AND an approximate bounding
   footprint in local mesh meters, reproject both to real lat/lon, and
   compute a compass direction + distance relative to the AOI's own center
   (a simple atan2/hypot -- "roughly 15m NE of center", nothing fancier).
6. Write a GeoJSON (gap footprint polygons + centroid points, real lat/lon)
   and a plain-text human-readable summary.

CELL-SIZE / THRESHOLD TUNING (empirical, against the real Prado v2 mesh --
see this story's own test run, not guessed):
Rasterizing the real, uncropped `odm_texturing/odm_textured_model_geo.obj`
(149,068 vertices / 192,240 faces total) restricted to the real parcel
bounding box (from `public/layer-viewer-samples/2806-prado/parcel.geojson`)
plus a few meters of buffer gives ~57 faces/m^2 and a median face area of
~0.028 m^2 (roughly a 17cm-per-side triangle) -- a dense, well-reconstructed
mesh overall. At that density:
  - Cell sizes at or below ~0.2m produced thousands of single-cell "empty"
    cells scattered evenly across even the well-covered interior -- normal
    triangulation sparsity, not real gaps.
  - Cell sizes of 0.3-0.5m collapsed that noise into a much smaller number of
    small (1-3 cell) scattered regions plus a handful of clearly larger,
    denser blobs (6-10+ contiguous cells, 1-2+ m^2) concentrated in specific
    spots -- a real, qualitative jump in region size, not a smooth continuum.
  - A minimum gap area of ~1.0 m^2 lands right at that jump: it drops the
    scattered single/double-cell noise (indistinguishable from normal mesh
    density variance) while keeping the handful of denser regions. 1 m^2 is
    also an operationally sane floor independent of this mesh's own density:
    a follow-up flight can't usefully "target" a hole smaller than about a
    meter across.
This tuning is mesh-density-dependent, which is why both the cell size and
the minimum gap area are derived/overridable, not hardcoded constants a
different mesh (different capture altitude, different overlap) would have to
fight.

No property-specific coordinates are hardcoded anywhere in this script --
all bounds are supplied by the caller via CLI arguments, matching
crop-mesh.py's own convention.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import math
import sys
from pathlib import Path
from typing import Optional

import numpy as np
import trimesh
from scipy import ndimage

# A cell is "a few dozen cm" per the story spec -- this many cells along the
# AOI's longer axis lands the derived cell size in that range for a
# property-scale AOI (tens of meters) without hardcoding an absolute size.
TARGET_CELLS_ALONG_LONGER_AXIS = 120
MIN_CELL_SIZE_M = 0.1
MAX_CELL_SIZE_M = 1.0

# See "CELL-SIZE / THRESHOLD TUNING" in the module docstring above for the
# empirical run that produced this default.
DEFAULT_MIN_GAP_AREA_M2 = 1.0


def load_crop_mesh_module():
    """Dynamically import the sibling crop-mesh.py (hyphenated filename, not
    a valid Python module name for a normal `import`) so this script reuses
    its UTM-offset parsing/reprojection functions verbatim rather than
    reimplementing them -- see this module's docstring."""
    crop_mesh_path = Path(__file__).resolve().parent / "crop-mesh.py"
    if not crop_mesh_path.exists():
        raise FileNotFoundError(
            f"expected crop-mesh.py alongside this script at {crop_mesh_path} "
            "(this script reuses its coords.txt parsing + UTM reprojection "
            "functions rather than reimplementing them)"
        )
    spec = importlib.util.spec_from_file_location("crop_mesh", crop_mesh_path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def derive_cell_size_m(extent_x: float, extent_y: float) -> float:
    """Pick a rasterization cell size from the AOI's own real extent (not a
    guessed fixed pixel count) -- see module docstring."""
    raw = max(extent_x, extent_y) / TARGET_CELLS_ALONG_LONGER_AXIS
    clamped = min(max(raw, MIN_CELL_SIZE_M), MAX_CELL_SIZE_M)
    # Round to the nearest 5cm for a "clean" grid size, not an ugly float.
    return round(clamped / 0.05) * 0.05


def collect_face_centroids(scene: trimesh.Scene) -> np.ndarray:
    """Every face's centroid (x, y, z) across every material in the scene,
    in the mesh's local frame. Face centroid, not per-vertex -- consistent
    with crop-mesh.py's own "why filter by face centroid" reasoning: it's
    the natural face-level unit of "is there reconstructed surface here."
    """
    parts = []
    for geom in scene.geometry.values():
        if not isinstance(geom, trimesh.Trimesh) or len(geom.faces) == 0:
            continue
        parts.append(geom.vertices[geom.faces].mean(axis=1))
    if not parts:
        raise ValueError("mesh scene contained no triangulated geometry")
    return np.concatenate(parts, axis=0)


def resolve_aoi_bounds(
    args: argparse.Namespace, crop_mesh
) -> tuple[float, float, float, float]:
    """Return (x_min, y_min, x_max, y_max) in the mesh's local frame for the
    requested area of interest."""
    using_local = None not in (args.x_min, args.x_max, args.y_min, args.y_max)
    using_latlon = None not in (args.lat_min, args.lat_max, args.lon_min, args.lon_max)

    chosen = sum([using_local, using_latlon, args.full_extent])
    if chosen == 0:
        raise ValueError(
            "no analysis area of interest given -- pass --x-min/--x-max/"
            "--y-min/--y-max, --lat-min/--lat-max/--lon-min/--lon-max, or "
            "--full-extent to explicitly opt into analyzing the mesh's "
            "entire real extent (which likely includes off-property "
            "geometry -- see this script's module docstring)"
        )
    if chosen > 1:
        raise ValueError(
            "pass exactly one of --x-min/.../--y-max, --lat-min/.../--lon-max, "
            "or --full-extent, not more than one"
        )

    if args.full_extent:
        verts = np.concatenate(
            [g.vertices for g in args.scene.geometry.values() if isinstance(g, trimesh.Trimesh)],
            axis=0,
        )
        x_min, y_min = verts[:, 0].min(), verts[:, 1].min()
        x_max, y_max = verts[:, 0].max(), verts[:, 1].max()
        print(
            "warning: --full-extent analyzes the mesh's entire real bounding "
            "box, which for a wide oblique-orbit capture likely includes real "
            "off-property geometry (street, neighboring parcels, sky) -- "
            "regions flagged out there are not meaningful coverage gaps.",
            file=sys.stderr,
        )
    elif using_local:
        x_min, x_max = sorted((args.x_min, args.x_max))
        y_min, y_max = sorted((args.y_min, args.y_max))
    else:
        if args.coords_txt is None:
            raise ValueError(
                "--lat-min/--lat-max/--lon-min/--lon-max requires --coords-txt "
                "(same requirement as crop-mesh.py's --lat-lon-bounds mode)"
            )
        x_min, y_min, x_max, y_max = crop_mesh.local_bounds_from_lat_lon(
            lat_min=args.lat_min,
            lon_min=args.lon_min,
            lat_max=args.lat_max,
            lon_max=args.lon_max,
            coords_txt_path=args.coords_txt,
            source_crs=args.source_crs,
        )

    if args.buffer_meters:
        x_min -= args.buffer_meters
        x_max += args.buffer_meters
        y_min -= args.buffer_meters
        y_max += args.buffer_meters

    return x_min, y_min, x_max, y_max


def rasterize_coverage(
    centroids_xy: np.ndarray,
    x_min: float,
    y_min: float,
    x_max: float,
    y_max: float,
    cell_size_m: float,
) -> np.ndarray:
    """Boolean grid, True where at least one face centroid falls in that
    cell. grid[row, col] with row indexing Y (north) and col indexing X
    (east), matching how the rest of this script reads it."""
    n_cols = max(1, int(math.ceil((x_max - x_min) / cell_size_m)))
    n_rows = max(1, int(math.ceil((y_max - y_min) / cell_size_m)))
    grid = np.zeros((n_rows, n_cols), dtype=bool)

    in_aoi = (
        (centroids_xy[:, 0] >= x_min)
        & (centroids_xy[:, 0] <= x_max)
        & (centroids_xy[:, 1] >= y_min)
        & (centroids_xy[:, 1] <= y_max)
    )
    pts = centroids_xy[in_aoi]
    cols = np.clip(((pts[:, 0] - x_min) / cell_size_m).astype(int), 0, n_cols - 1)
    rows = np.clip(((pts[:, 1] - y_min) / cell_size_m).astype(int), 0, n_rows - 1)
    grid[rows, cols] = True
    return grid


def find_gap_regions(
    grid: np.ndarray,
    x_min: float,
    y_min: float,
    cell_size_m: float,
    min_gap_area_m2: float,
    include_border_regions: bool,
) -> list[dict]:
    """Connected-component analysis over the *uncovered* cells. Returns a
    list of gap dicts (local-frame centroid + bounding footprint + area +
    cell count), largest first."""
    empty = ~grid
    labeled, num_labels = ndimage.label(empty)

    border_labels: set[int] = set()
    if not include_border_regions:
        border_labels |= set(np.unique(labeled[0, :]))
        border_labels |= set(np.unique(labeled[-1, :]))
        border_labels |= set(np.unique(labeled[:, 0]))
        border_labels |= set(np.unique(labeled[:, -1]))
        border_labels.discard(0)

    min_cells = max(1, math.ceil(min_gap_area_m2 / (cell_size_m**2)))

    gaps = []
    for label_id in range(1, num_labels + 1):
        if label_id in border_labels:
            continue
        rows, cols = np.where(labeled == label_id)
        cell_count = len(rows)
        if cell_count < min_cells:
            continue

        area_m2 = cell_count * cell_size_m**2
        # Cell-center-based centroid (mean of covered cells' own centers).
        centroid_x = x_min + (cols.mean() + 0.5) * cell_size_m
        centroid_y = y_min + (rows.mean() + 0.5) * cell_size_m
        # Approximate footprint: axis-aligned bounding box of this region's
        # cells (not an exact voxel outline -- documented as approximate in
        # the emitted GeoJSON's own properties).
        footprint_x_min = x_min + cols.min() * cell_size_m
        footprint_x_max = x_min + (cols.max() + 1) * cell_size_m
        footprint_y_min = y_min + rows.min() * cell_size_m
        footprint_y_max = y_min + (rows.max() + 1) * cell_size_m

        gaps.append(
            {
                "cell_count": int(cell_count),
                "area_m2": float(area_m2),
                "centroid_local": (float(centroid_x), float(centroid_y)),
                "footprint_local_bounds": (
                    float(footprint_x_min),
                    float(footprint_y_min),
                    float(footprint_x_max),
                    float(footprint_y_max),
                ),
            }
        )

    gaps.sort(key=lambda g: g["area_m2"], reverse=True)
    return gaps


def local_to_lonlat(
    x: float, y: float, utm_epsg: str, offset_easting: float, offset_northing: float
) -> tuple[float, float]:
    """Inverse of crop-mesh.py's local_bounds_from_lat_lon: local mesh
    meters -> real UTM easting/northing (by adding back the coords.txt
    offset) -> real lon/lat (WGS84) via the same UTM zone crop-mesh.py
    already resolves from coords.txt. Returns (lon, lat)."""
    import pyproj

    easting = x + offset_easting
    northing = y + offset_northing
    transformer = pyproj.Transformer.from_crs(utm_epsg, "EPSG:4326", always_xy=True)
    lon, lat = transformer.transform(easting, northing)
    return lon, lat


COMPASS_POINTS = [
    "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
]


def compass_description(dx: float, dy: float) -> tuple[float, str, float]:
    """dx/dy = gap centroid minus AOI-center, in local meters (local X ~
    UTM easting / east-positive, local Y ~ UTM northing / north-positive --
    the RAW ODM OBJ's own frame, before crop-mesh.py's Y-up axis correction,
    which is a glTF-viewer concern this script never applies). Returns
    (bearing_degrees, 16-point compass label, distance_m)."""
    distance_m = math.hypot(dx, dy)
    bearing_deg = (math.degrees(math.atan2(dx, dy)) + 360.0) % 360.0
    index = int((bearing_deg + 11.25) // 22.5) % 16
    return bearing_deg, COMPASS_POINTS[index], distance_m


def build_report(
    gaps_local: list[dict],
    utm_epsg: str,
    offset_easting: float,
    offset_northing: float,
    aoi_bounds: tuple[float, float, float, float],
) -> tuple[dict, str]:
    x_min, y_min, x_max, y_max = aoi_bounds
    center_x = (x_min + x_max) / 2.0
    center_y = (y_min + y_max) / 2.0
    center_lon, center_lat = local_to_lonlat(center_x, center_y, utm_epsg, offset_easting, offset_northing)

    features = []
    summary_lines = []
    summary_lines.append("Coverage-gap detection report")
    summary_lines.append("=" * 32)
    summary_lines.append("")
    summary_lines.append(
        "This report lists mesh regions where photogrammetry reconstruction "
        "produced NO surface -- real, unfilled holes. It does NOT know why "
        "any given gap exists (occlusion, insufficient camera overlap, a "
        "flat/featureless surface, or an artifact of this analysis window's "
        "own edge are all possible) -- that judgment is left to whoever "
        "reviews the flagged location."
    )
    summary_lines.append("")
    summary_lines.append(
        f"Property-area-of-interest center (reference point for directions "
        f"below): {center_lat:.6f}, {center_lon:.6f}"
    )
    summary_lines.append(f"Gaps found: {len(gaps_local)}")
    summary_lines.append("")

    if not gaps_local:
        summary_lines.append(
            "No coverage gaps above the minimum size threshold were found in "
            "this area of interest."
        )

    for i, gap in enumerate(gaps_local, start=1):
        cx, cy = gap["centroid_local"]
        lon, lat = local_to_lonlat(cx, cy, utm_epsg, offset_easting, offset_northing)

        fx_min, fy_min, fx_max, fy_max = gap["footprint_local_bounds"]
        footprint_lonlat = [
            local_to_lonlat(fx, fy, utm_epsg, offset_easting, offset_northing)
            for fx, fy in [
                (fx_min, fy_min),
                (fx_max, fy_min),
                (fx_max, fy_max),
                (fx_min, fy_max),
                (fx_min, fy_min),
            ]
        ]

        bearing_deg, compass, distance_m = compass_description(cx - center_x, cy - center_y)

        gap_id = f"gap-{i:02d}"
        summary_lines.append(
            f"{gap_id}: ~{gap['area_m2']:.2f} m^2 ({gap['cell_count']} grid cells), "
            f"centroid {lat:.6f}, {lon:.6f} -- roughly {distance_m:.1f}m {compass} "
            f"of the property-area center (bearing {bearing_deg:.0f} deg)"
        )

        features.append(
            {
                "type": "Feature",
                "properties": {
                    "id": gap_id,
                    "area_m2": round(gap["area_m2"], 3),
                    "cell_count": gap["cell_count"],
                    "distance_from_center_m": round(distance_m, 2),
                    "bearing_deg_from_center": round(bearing_deg, 1),
                    "compass_direction_from_center": compass,
                    "note": (
                        "Location and approximate size only -- this tool does "
                        "not determine why this region has no reconstructed "
                        "mesh surface."
                    ),
                },
                "geometry": {"type": "Point", "coordinates": [lon, lat]},
            }
        )
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "id": f"{gap_id}-footprint",
                    "for_gap": gap_id,
                    "note": (
                        "Approximate axis-aligned bounding footprint of the "
                        "gap's grid cells, reprojected to lat/lon -- not an "
                        "exact voxel outline."
                    ),
                },
                "geometry": {"type": "Polygon", "coordinates": [footprint_lonlat]},
            }
        )

    geojson = {
        "type": "FeatureCollection",
        "properties": {
            "generated_by": "pipeline/scripts/detect-coverage-gaps.py",
            "gap_count": len(gaps_local),
            "aoi_center": [center_lon, center_lat],
        },
        "features": features,
    }

    return geojson, "\n".join(summary_lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Find real, unreconstructed holes in a textured ODM mesh and "
            "report each one's approximate real-world lat/lon + compass "
            "direction, so a follow-up flight knows roughly where to point "
            "the camera. Does NOT claim to know why any gap exists."
        )
    )
    parser.add_argument("input_obj", type=Path, help="Path to the ODM textured .obj to analyze")
    parser.add_argument(
        "--coords-txt",
        type=Path,
        required=True,
        help="Path to the ODM project's odm_georeferencing/coords.txt (required -- gap locations are always reprojected to lat/lon)",
    )

    local_group = parser.add_argument_group("area of interest -- local mesh meters")
    local_group.add_argument("--x-min", type=float)
    local_group.add_argument("--x-max", type=float)
    local_group.add_argument("--y-min", type=float)
    local_group.add_argument("--y-max", type=float)

    latlon_group = parser.add_argument_group("area of interest -- lat/lon (reprojected via --coords-txt)")
    latlon_group.add_argument("--lat-min", type=float)
    latlon_group.add_argument("--lat-max", type=float)
    latlon_group.add_argument("--lon-min", type=float)
    latlon_group.add_argument("--lon-max", type=float)
    latlon_group.add_argument(
        "--source-crs",
        default="EPSG:4326",
        help="CRS the --lat-*/--lon-* bounds are given in (default: EPSG:4326 / WGS84)",
    )

    parser.add_argument(
        "--full-extent",
        action="store_true",
        help="Analyze the mesh's entire real vertex extent instead of a bounded area of interest (see module docstring for why this is opt-in, not the default)",
    )
    parser.add_argument(
        "--buffer-meters",
        type=float,
        default=0.0,
        help="Expand the area of interest outward by this many meters on every side before analysis (e.g. to include a structure's eaves near a parcel-boundary AOI)",
    )
    parser.add_argument(
        "--cell-size-m",
        type=float,
        default=None,
        help="Override the auto-derived rasterization cell size (meters). Default: derived from the AOI's own real extent, see module docstring.",
    )
    parser.add_argument(
        "--min-gap-area-m2",
        type=float,
        default=DEFAULT_MIN_GAP_AREA_M2,
        help=f"Minimum connected-region area (m^2) to report as a real gap, not noise. Default: {DEFAULT_MIN_GAP_AREA_M2} -- see module docstring for the empirical tuning behind it.",
    )
    parser.add_argument(
        "--include-border-regions",
        action="store_true",
        help="Include empty regions that touch the AOI's own edge (excluded by default -- see module docstring)",
    )
    parser.add_argument(
        "--out-geojson",
        type=Path,
        default=Path("coverage-gaps.geojson"),
        help="Output GeoJSON path (default: ./coverage-gaps.geojson)",
    )
    parser.add_argument(
        "--out-summary",
        type=Path,
        default=Path("coverage-gaps.txt"),
        help="Output plain-text summary path (default: ./coverage-gaps.txt)",
    )

    args = parser.parse_args()

    if not args.input_obj.exists():
        print(f"error: input OBJ not found: {args.input_obj}", file=sys.stderr)
        return 1
    if not args.coords_txt.exists():
        print(f"error: coords.txt not found: {args.coords_txt}", file=sys.stderr)
        return 1

    crop_mesh = load_crop_mesh_module()

    print(f"Loading {args.input_obj} as a multi-material trimesh Scene...")
    scene = trimesh.load(str(args.input_obj), force="scene")
    if not isinstance(scene, trimesh.Scene):
        print("error: trimesh did not load this OBJ as a Scene (force='scene' failed)", file=sys.stderr)
        return 1
    args.scene = scene  # stashed for resolve_aoi_bounds's --full-extent path

    verts_total = sum(len(g.vertices) for g in scene.geometry.values() if isinstance(g, trimesh.Trimesh))
    faces_total = sum(len(g.faces) for g in scene.geometry.values() if isinstance(g, trimesh.Trimesh))
    print(f"Loaded: {len(scene.geometry)} materials, {verts_total} vertices, {faces_total} faces")

    try:
        x_min, y_min, x_max, y_max = resolve_aoi_bounds(args, crop_mesh)
    except ValueError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    extent_x = x_max - x_min
    extent_y = y_max - y_min
    print(f"Area of interest (local frame): x=[{x_min:.2f}, {x_max:.2f}], y=[{y_min:.2f}, {y_max:.2f}] ({extent_x:.1f}m x {extent_y:.1f}m)")

    cell_size_m = args.cell_size_m or derive_cell_size_m(extent_x, extent_y)
    print(f"Rasterization cell size: {cell_size_m:.2f}m (min gap area threshold: {args.min_gap_area_m2:.2f} m^2)")

    centroids = collect_face_centroids(scene)
    grid = rasterize_coverage(centroids[:, :2], x_min, y_min, x_max, y_max, cell_size_m)
    covered_frac = grid.mean()
    print(f"Grid: {grid.shape[1]}x{grid.shape[0]} cells, {covered_frac * 100:.1f}% covered")

    gaps_local = find_gap_regions(
        grid,
        x_min,
        y_min,
        cell_size_m,
        args.min_gap_area_m2,
        args.include_border_regions,
    )
    print(f"Gap regions found (>= {args.min_gap_area_m2:.2f} m^2, interior only): {len(gaps_local)}")

    utm_zone_desc, offset_easting, offset_northing = crop_mesh.parse_coords_txt(args.coords_txt)
    utm_epsg = crop_mesh.utm_epsg_from_zone_desc(utm_zone_desc)

    geojson, summary_text = build_report(
        gaps_local, utm_epsg, offset_easting, offset_northing, (x_min, y_min, x_max, y_max)
    )

    args.out_geojson.parent.mkdir(parents=True, exist_ok=True)
    args.out_geojson.write_text(json.dumps(geojson, indent=2))
    print(f"Wrote {args.out_geojson}")

    args.out_summary.parent.mkdir(parents=True, exist_ok=True)
    args.out_summary.write_text(summary_text)
    print(f"Wrote {args.out_summary}")

    print("")
    print(summary_text)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
