#!/usr/bin/env python3
"""crop-mesh.py — per-material spatial crop + Y-up axis correction for a real
ODM textured OBJ mesh.

Why this exists (see pipeline/README.md §3 and this repo's real v2 mesh work):
a wide oblique-orbit capture (flown to fix nadir-only tree-canopy occlusion —
see the operator's real drone-jobs job notes) reconstructs real geometry from
neighboring parcels/street/sky far outside the property being shipped as a
sample. Those far-outlier vertices blow out <Model3D>'s drei <Bounds> auto-
framing (the whole scene gets framed to fit the outliers, so the actual
property renders tiny in a corner). Cropping to the property's own real-world
bounds *before* the mesh is simplified/compressed fixes that framing problem
at the source, rather than trying to fix it in the viewer.

PIPELINE ORDERING (must be followed exactly — see convert-mesh.sh's own
header comment for the other half of this contract):

    crop (this script) -> resize -> Y-up axis-correct (this script) -> draco

This script performs BOTH the crop and the axis correction in one pass
(cropping and axis-correction both need to happen before Draco: Draco
compresses the *encoded* geometry, and this script's decoder/exporter isn't
wired to read already-Draco-compressed input back in). convert-mesh.sh calls
obj2gltf + gltf-transform resize on the *cropped* output this script
produces, then runs gltf-transform draco last.

WHY CROP BY FACE CENTROID, NOT BY VERTEX:
Filtering individual vertices against a bounding box fragments faces — a
triangle with one vertex just outside the box and two just inside would lose
that vertex, deleting or corrupting the face. Filtering by each face's
centroid keeps every face's three vertices together: either the whole
triangle survives (centroid inside bounds) or none of it does. This trades a
small amount of boundary precision (a triangle whose centroid is inside but
which pokes slightly outside the box, or vice versa) for a mesh with no
degenerate/broken faces at the crop boundary.

WHY THE CROP BOUNDS ARE IN THE MESH'S OWN LOCAL FRAME:
ODM's georeferenced OBJ output is not in raw lat/lon or even raw UTM meters —
every vertex is in meters *relative to* an arbitrary local offset ODM itself
picks per-project, recorded in that project's own
`odm_georeferencing/coords.txt`. That file's format (real example, from this
repo's own v2 Prado job):

    WGS84 UTM 14N
    624277 3348518
    <per-vertex offsets follow, not needed here>

Line 1 is the UTM zone/datum the project reconstructed in. Line 2 is the
easting/northing (in meters) of the local origin every OBJ vertex is offset
from. To crop by a real-world lat/lon box, that box must be reprojected into
the *same* UTM zone (via pyproj) and then have this same easting/northing
subtracted — only then does it land in the mesh's own local coordinate frame.
This script accepts bounds either already in that local frame (--local-bounds)
or as lat/lon + the project's own coords.txt (--lat-lon-bounds + --coords-txt),
doing the UTM reprojection + offset subtraction for you in the latter case.

No property-specific coordinates are hardcoded anywhere in this script — all
bounds are supplied by the caller via CLI arguments.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import trimesh


def parse_coords_txt(coords_txt_path: Path) -> tuple[str, float, float]:
    """Parse an ODM odm_georeferencing/coords.txt file.

    Real example (this repo's own v2 Prado job):
        WGS84 UTM 14N
        624277 3348518
        <per-vertex offset triples follow — not needed for this script>

    Returns (utm_zone_desc, offset_easting, offset_northing).
    """
    lines = coords_txt_path.read_text().splitlines()
    if len(lines) < 2:
        raise ValueError(
            f"{coords_txt_path}: expected at least 2 lines (UTM zone, then "
            "easting/northing offset), got %d" % len(lines)
        )
    utm_zone_desc = lines[0].strip()
    offset_parts = lines[1].split()
    if len(offset_parts) < 2:
        raise ValueError(
            f"{coords_txt_path}: line 2 must be '<easting> <northing>', got "
            f"{lines[1]!r}"
        )
    offset_easting = float(offset_parts[0])
    offset_northing = float(offset_parts[1])
    return utm_zone_desc, offset_easting, offset_northing


def utm_epsg_from_zone_desc(utm_zone_desc: str) -> str:
    """Convert an ODM coords.txt zone description (e.g. 'WGS84 UTM 14N') into
    an EPSG code pyproj can target (e.g. 'EPSG:32614')."""
    parts = utm_zone_desc.split()
    zone_token = next((p for p in parts if p.upper().endswith(("N", "S")) and p[:-1].isdigit()), None)
    if zone_token is None:
        raise ValueError(
            f"could not parse a UTM zone number/hemisphere out of {utm_zone_desc!r} "
            "(expected something like 'WGS84 UTM 14N')"
        )
    zone_number = int(zone_token[:-1])
    hemisphere = zone_token[-1].upper()
    # EPSG 326xx = northern hemisphere, 327xx = southern hemisphere.
    base = 32600 if hemisphere == "N" else 32700
    return f"EPSG:{base + zone_number}"


def local_bounds_from_lat_lon(
    lat_min: float,
    lon_min: float,
    lat_max: float,
    lon_max: float,
    coords_txt_path: Path,
    source_crs: str,
) -> tuple[float, float, float, float]:
    """Reproject a lat/lon box into the ODM project's own UTM zone, then
    subtract that project's coords.txt offset — landing the box in the same
    local coordinate frame every vertex in the OBJ is already in."""
    import pyproj

    utm_zone_desc, offset_easting, offset_northing = parse_coords_txt(coords_txt_path)
    dst_epsg = utm_epsg_from_zone_desc(utm_zone_desc)

    transformer = pyproj.Transformer.from_crs(source_crs, dst_epsg, always_xy=True)
    easting_min, northing_min = transformer.transform(lon_min, lat_min)
    easting_max, northing_max = transformer.transform(lon_max, lat_max)

    x_min = min(easting_min, easting_max) - offset_easting
    x_max = max(easting_min, easting_max) - offset_easting
    y_min = min(northing_min, northing_max) - offset_northing
    y_max = max(northing_min, northing_max) - offset_northing
    return x_min, y_min, x_max, y_max


def crop_scene_by_face_centroid(
    scene: trimesh.Scene,
    x_min: float,
    y_min: float,
    x_max: float,
    y_max: float,
) -> tuple[trimesh.Scene, int, int, int, int]:
    """Crop every geometry (material) in a multi-material Scene by filtering
    FACES whose centroid falls within [x_min,x_max] x [y_min,y_max] (mesh
    local X/Y — Z/up-down is left uncropped, this is a horizontal/footprint
    crop). Returns (cropped_scene, verts_before, verts_after, faces_before,
    faces_after)."""
    verts_before = 0
    faces_before = 0
    verts_after = 0
    faces_after = 0

    cropped_geometry: dict[str, trimesh.Trimesh] = {}
    for name, geom in scene.geometry.items():
        if not isinstance(geom, trimesh.Trimesh):
            continue
        verts_before += len(geom.vertices)
        faces_before += len(geom.faces)

        centroids = geom.vertices[geom.faces].mean(axis=1)
        keep_mask = (
            (centroids[:, 0] >= x_min)
            & (centroids[:, 0] <= x_max)
            & (centroids[:, 1] >= y_min)
            & (centroids[:, 1] <= y_max)
        )

        if not keep_mask.any():
            # No faces from this material survive the crop — drop it
            # entirely rather than exporting an empty mesh.
            continue

        cropped = geom.submesh([keep_mask], append=True)
        if cropped is None or len(cropped.faces) == 0:
            continue

        cropped_geometry[name] = cropped
        verts_after += len(cropped.vertices)
        faces_after += len(cropped.faces)

    if not cropped_geometry:
        raise ValueError(
            "crop bounds excluded every face of every material — check that "
            "the bounds are in the mesh's local coordinate frame (see this "
            "script's --lat-lon-bounds / --coords-txt path for the "
            "reprojection this needs) and that they actually overlap the "
            "mesh's real extent"
        )

    cropped_scene = trimesh.Scene(cropped_geometry)
    return cropped_scene, verts_before, verts_after, faces_before, faces_after


def apply_y_up_correction(scene: trimesh.Scene) -> None:
    """Rotate the whole scene -90deg about the X axis, in place.

    ODM/photogrammetry output is conventionally Z-up (Z = altitude). glTF
    (and three.js, and therefore <Model3D>/<LandOverlay>) is Y-up by
    convention. Without this correction the mesh imports "lying on its
    side" / rotated 90deg from how <Model3D>'s <Bounds>+<OrbitControls>
    expect to frame it.

    MUST run before Draco compression (see this script's module docstring
    and convert-mesh.sh's header comment) — this is a pre-Draco geometry
    transform, not something to bolt on after.
    """
    rotation = trimesh.transformations.rotation_matrix(
        angle=-np.pi / 2, direction=[1, 0, 0], point=[0, 0, 0]
    )
    scene.apply_transform(rotation)


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Crop a multi-material ODM textured OBJ mesh to a real-world "
            "bounding box (filtering by per-face centroid, not per-vertex) "
            "and apply the Y-up axis correction glTF/three.js expects. Must "
            "run before draco compression in the convert-mesh.sh chain."
        )
    )
    parser.add_argument("input_obj", type=Path, help="Path to the input ODM textured .obj")
    parser.add_argument("output_obj", type=Path, help="Path to write the cropped, axis-corrected .obj")
    parser.add_argument(
        "--no-crop",
        action="store_true",
        help=(
            "Skip the spatial crop entirely (still applies the Y-up axis "
            "correction). Use for a pure nadir-grid capture with no "
            "off-property outliers, where cropping is a no-op — see this "
            "story's design_decisions for why crop-mesh.py stays a "
            "separate, skippable step from convert-mesh.sh."
        ),
    )

    local_group = parser.add_argument_group(
        "local bounds (mesh's own local meters, e.g. already offset from an ODM coords.txt origin)"
    )
    local_group.add_argument("--x-min", type=float, help="Local-frame X minimum, meters")
    local_group.add_argument("--x-max", type=float, help="Local-frame X maximum, meters")
    local_group.add_argument("--y-min", type=float, help="Local-frame Y minimum, meters")
    local_group.add_argument("--y-max", type=float, help="Local-frame Y maximum, meters")

    latlon_group = parser.add_argument_group(
        "lat/lon bounds (reprojected into the mesh's local frame via coords.txt)"
    )
    latlon_group.add_argument("--lat-min", type=float, help="Latitude minimum, degrees")
    latlon_group.add_argument("--lat-max", type=float, help="Latitude maximum, degrees")
    latlon_group.add_argument("--lon-min", type=float, help="Longitude minimum, degrees")
    latlon_group.add_argument("--lon-max", type=float, help="Longitude maximum, degrees")
    latlon_group.add_argument(
        "--coords-txt",
        type=Path,
        help="Path to the ODM project's odm_georeferencing/coords.txt (required with --lat-min/--lat-max/--lon-min/--lon-max)",
    )
    latlon_group.add_argument(
        "--source-crs",
        default="EPSG:4326",
        help="CRS the --lat-*/--lon-* bounds are given in (default: EPSG:4326 / WGS84 lat-lon). EPSG:3857 also accepted.",
    )

    args = parser.parse_args()

    if not args.input_obj.exists():
        print(f"error: input OBJ not found: {args.input_obj}", file=sys.stderr)
        return 1

    using_local_bounds = None not in (args.x_min, args.x_max, args.y_min, args.y_max)
    using_latlon_bounds = None not in (args.lat_min, args.lat_max, args.lon_min, args.lon_max)

    if not args.no_crop:
        if using_local_bounds and using_latlon_bounds:
            print(
                "error: pass either --x-min/--x-max/--y-min/--y-max OR "
                "--lat-min/--lat-max/--lon-min/--lon-max, not both",
                file=sys.stderr,
            )
            return 1
        if not using_local_bounds and not using_latlon_bounds:
            print(
                "error: no crop bounds given — pass --x-min/--x-max/--y-min/--y-max, "
                "--lat-min/--lat-max/--lon-min/--lon-max (+ --coords-txt), or --no-crop "
                "to skip cropping entirely",
                file=sys.stderr,
            )
            return 1
        if using_latlon_bounds and args.coords_txt is None:
            print(
                "error: --lat-min/--lat-max/--lon-min/--lon-max requires --coords-txt "
                "(the ODM project's odm_georeferencing/coords.txt, to reproject the "
                "lat/lon box into the mesh's local coordinate frame)",
                file=sys.stderr,
            )
            return 1

    print(f"Loading {args.input_obj} as a multi-material trimesh Scene...")
    scene = trimesh.load(str(args.input_obj), force="scene")
    if not isinstance(scene, trimesh.Scene):
        print("error: trimesh did not load this OBJ as a Scene (force='scene' failed)", file=sys.stderr)
        return 1

    verts_before = sum(len(g.vertices) for g in scene.geometry.values() if isinstance(g, trimesh.Trimesh))
    faces_before = sum(len(g.faces) for g in scene.geometry.values() if isinstance(g, trimesh.Trimesh))
    print(f"Loaded: {len(scene.geometry)} materials, {verts_before} vertices, {faces_before} faces")

    if args.no_crop:
        print("--no-crop: skipping spatial crop, applying Y-up axis correction only.")
        cropped_scene = scene
        verts_after, faces_after = verts_before, faces_before
    else:
        if using_local_bounds:
            x_min, x_max = sorted((args.x_min, args.x_max))
            y_min, y_max = sorted((args.y_min, args.y_max))
        else:
            x_min, y_min, x_max, y_max = local_bounds_from_lat_lon(
                lat_min=args.lat_min,
                lon_min=args.lon_min,
                lat_max=args.lat_max,
                lon_max=args.lon_max,
                coords_txt_path=args.coords_txt,
                source_crs=args.source_crs,
            )
            print(
                f"Reprojected lat/lon bounds -> local frame: "
                f"x=[{x_min:.2f}, {x_max:.2f}], y=[{y_min:.2f}, {y_max:.2f}] (meters)"
            )

        try:
            cropped_scene, verts_before, verts_after, faces_before, faces_after = crop_scene_by_face_centroid(
                scene, x_min, y_min, x_max, y_max
            )
        except ValueError as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 1
        print(
            f"Cropped: {faces_before} -> {faces_after} faces "
            f"({verts_before} -> {verts_after} vertices), "
            f"{len(scene.geometry)} -> {len(cropped_scene.geometry)} materials"
        )

    apply_y_up_correction(cropped_scene)
    print("Applied Y-up axis correction (-90deg about X).")

    args.output_obj.parent.mkdir(parents=True, exist_ok=True)
    cropped_scene.export(str(args.output_obj))
    print(f"Wrote {args.output_obj}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
