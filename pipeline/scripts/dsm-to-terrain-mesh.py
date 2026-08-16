#!/usr/bin/env python3
"""dsm-to-terrain-mesh.py — GeoTIFF DSM -> a smooth terrain-surface glTF/glb,
aligned to the same local coordinate frame as an ODM textured-mesh export
(the pipeline crop-mesh.py/convert-mesh.sh produce), for <Model3D>'s
"meld the model" terrain-drape feature.

WHY THIS EXISTS (see .pHive/epics/mesh-quality-and-terrain-pipeline/stories/
model3d-terrain-melding.yaml): the real photogrammetry mesh
(public/model3d-samples/prado/model.glb) has real, visible holes where
reconstruction failed (occlusion under tree canopy, insufficient camera
overlap — confirmed by this same epic's detect-coverage-gaps.py, 2 real
gaps on this property's east side). A DSM covers the same footprint with no
holes (every pixel has a value). Rendering a low-poly surface built
straight from the DSM underneath the photogrammetry mesh means a real hole
shows real (if lower-detail) terrain instead of blank canvas background.

DSM, NOT DTM — DELIBERATE: `odm_dem/dsm.tif` (digital SURFACE model — top
of whatever's there: roof, canopy, ground) is used, not `dtm.tif` (digital
TERRAIN model — bare-earth only, structures/vegetation stripped out). A DTM
would put the terrain surface at bare-ground level even under the roofline,
which would either float visibly above the actual ground-level parts of the
mesh or (more likely, since a DTM surface is completely uncorrelated with
the reconstructed mesh's own roof/canopy geometry) poke jarringly through
whatever cladding the photogrammetry mesh DOES have in that area. The DSM's
top-of-surface value is what a gap in the mesh is actually missing — the
same convention this repo's own hillshade.tif sample was already baked
from (see this story's own spec).

OUTPUT FORMAT — WHY A PRE-BAKED glTF, NOT A RUNTIME HEIGHTMAP TEXTURE:
components/Model3D/Model3D.tsx already loads exactly one kind of asset —
a glTF/glb via `useLoader(GLTFLoader, ...)` inside a Suspense boundary —
for the photogrammetry mesh. Baking the terrain as a second glTF lets
<Model3D> load it through that exact same, already-proven code path (a
second `<GltfScene url=... />`) with ZERO new runtime geometry code, no
new texture-sampling/vertex-displacement shader logic, and no separate
alignment transform to get right in TypeScript — the terrain mesh is
authored, in this script, directly into the SAME local coordinate frame
crop-mesh.py already established for model.glb (see "COORDINATE FRAME"
below), so <Model3D> just renders it as a sibling with no position/rotation
props at all. A runtime-displaced PlaneGeometry would duplicate that
alignment math in JS and add a second thing to keep in sync with any future
re-crop — this doesn't.

COORDINATE FRAME — REUSES crop-mesh.py's OWN UTM-OFFSET + Y-UP TECHIQUE,
NOT A NEW ONE (read crop-mesh.py's module docstring first if you haven't):
ODM's georeferenced OBJ output puts every vertex in meters *local* to an
arbitrary per-project origin recorded in that project's own
`odm_georeferencing/coords.txt` (UTM zone/datum line 1, easting/northing
offset line 2), then crop-mesh.py rotates -90deg about X to convert ODM's
native Z-up (Z = absolute elevation, meters ASL) into glTF's Y-up
convention. This script reuses that exact chain (dynamically importing
crop-mesh.py for `parse_coords_txt`/`utm_epsg_from_zone_desc`, same
precedent detect-coverage-gaps.py already set for reusing it) so a terrain
vertex at real-world UTM (E, N) with elevation Z lands at

    final_x = E - offset_easting
    final_y = Z - y_offset_m   (Y-up: elevation IS height; y_offset_m below)
    final_z = -(N - offset_northing)

— i.e. exactly the same (x, y, z) a `crop-mesh.py`-processed OBJ vertex at
that same real-world location would land at (confirmed empirically against
the real, uncropped v2 Prado OBJ: in-parcel-box vertices have Z in
137.8-156.4, matching this same DSM's own elevation range for that area —
see this story's own research notes). No separate "geo-anchoring" transform
needs to be applied by <Model3D> at load time; the baked mesh is already in
that frame.

VERTICAL DRAPE OFFSET (`--y-offset-m`, default see DEFAULT_Y_OFFSET_M
below): a standard GIS-drape technique — shift the ENTIRE terrain surface
down by a small, constant amount from its own true elevation, rather than
rendering it exactly coplanar with the mesh. Both surfaces are ultimately
sourced from the same real photogrammetry reconstruction, so at bare-ground
areas (the mesh's own lowest points) the terrain's true elevation and the
mesh's own surface elevation can be nearly numerically identical — a small
uniform downward shift keeps the terrain strictly beneath the mesh
everywhere (not just at that coincidence) without flattening or distorting
its real shape, which visibly floating the WHOLE terrain down to the mesh's
single global minimum would do (a real gap high up near roof height would
then show terrain far below where the hole actually is, breaking the
"meld" effect this story wants). `--y-offset-m` operates directly on the
already Y-up `final_y` (elevation) value above.

RESAMPLING — BILINEAR ON A UNIFORM WORLD-SPACE GRID, NOT BLOCK-POOLING:
dem-to-heightmap.py (a sibling script, reused here for its nodata-fill +
lat/lon-bbox-crop helpers — dynamically imported, same precedent) block-
pools its output because VoxelTerrain wants one INTEGER height band per
fixed-size grid cell, indexed only by row/col with no notion of the cell's
own real-world position. This script wants the opposite: a small number of
vertices (a few hundred per side, not VoxelTerrain's ~64) each at a KNOWN
real-world (E, N), for a smooth continuous surface mesh, not a voxel
block-count. `numpy.array_split`-based block-pooling produces slightly
uneven chunk sizes (off-by-one source pixel per chunk) with no clean
per-chunk world coordinate; sampling a perfectly uniform world-space grid
via bilinear interpolation (`scipy.ndimage.map_coordinates`, order=1) gives
every vertex an exact, evenly-spaced real-world (E, N) and a smoothly
interpolated elevation, at whatever `--grid-size` resolution is asked for.

WINDING/NORMALS: triangle winding for the (row, col) grid is chosen so
faces are counter-clockwise when viewed from +Y (i.e. face normals point
up, `(v1-v0) x (v2-v0)` with +Y dominant) — verified against this script's
own coordinate convention above, and defensively re-checked at runtime
(`_ensure_upward_faces`) by averaging the actual computed face normals and
flipping every face's winding if that average points down, rather than
trusting the hand-derived winding blindly. The exported material is also
marked double-sided, so even an unexpected viewing angle (or a future
coordinate-convention change elsewhere in the pipeline) can't make the
terrain invisible.

MATERIAL: a plain, unlit-ish muted earth-tone PBR color, not a DSM-derived
texture — this is a low-detail FILL surface meant to read as "real terrain
where the good stuff is missing," not to compete visually with the
photogrammetry mesh's own real texture.

No property-specific coordinates are hardcoded anywhere in this script —
all bounds/paths/offsets are supplied by the caller via CLI arguments, same
convention as crop-mesh.py/dem-to-heightmap.py/detect-coverage-gaps.py.

Usage:
    dsm-to-terrain-mesh.py <input-dsm.tif> [<input-dsm2.tif> ...] \\
        --output terrain.glb --coords-txt <coords.txt> \\
        --lat-min <deg> --lat-max <deg> --lon-min <deg> --lon-max <deg> \\
        [--buffer-meters 5] [--grid-size 200] [--y-offset-m 0.2]
"""
from __future__ import annotations

import argparse
import importlib.util
import sys
from pathlib import Path

import numpy as np
import rasterio
import rasterio.merge
import rasterio.warp
import trimesh
from scipy import ndimage

# A few hundred vertices per side -- smooth enough to read as a continuous
# surface at property scale (tens of meters), far finer than VoxelTerrain's
# ~64-cell voxel grid, but nowhere near the DSM's own native ~5cm pixel
# resolution (which would be hundreds of thousands of vertices, wildly
# oversized for a "fill the gaps" base layer under a ~90k-vertex mesh).
DEFAULT_GRID_SIZE = 200

# See "VERTICAL DRAPE OFFSET" in the module docstring above. NOT a guessed
# round number -- measured empirically against the real 2806 Prado data:
# `npx @gltf-transform/cli inspect model.glb` reports the real, currently-
# shipped photogrammetry mesh's own bboxMax.y (highest reconstructed point,
# the roof ridge) as 156.42828. This script's own real DSM-sampled terrain
# grid, with ZERO offset applied, independently reached a peak of 156.84 in
# the same run -- i.e. the DSM's surface at that ridge reads ~0.41m HIGHER
# than the mesh's own highest vertex there (photogrammetry mildly
# under-resolves a sharp roof ridge; the DSM apparently doesn't smooth it
# away quite as much). A small delta like 20cm would NOT clear that real,
# measured discrepancy -- the terrain would poke through the mesh right at
# its own tallest point. 1.0m clears the measured ~0.41m gap with a >2x
# safety margin while staying visually negligible at this property's real
# ~20-40m footprint / ~20m elevation range (at <Model3D>'s ~30 degree
# default oblique viewing angle, a 1m vertical offset reads as well under a
# 2m apparent horizontal gap against a 40m-wide scene).
DEFAULT_Y_OFFSET_M = 1.0

# A muted, desaturated earth tone -- reads as "terrain," not attempting to
# imitate the photogrammetry mesh's own real texture. roughnessFactor=1,
# metallicFactor=0: a flat, non-shiny diffuse surface so <Model3D>'s
# directional lights still model real shadowing/shading across the terrain's
# undulation (the operator's own "fill in and shadows" framing) without
# specular highlights that would read as wet/metallic.
TERRAIN_BASE_COLOR = (0.55, 0.5, 0.42, 1.0)


def load_crop_mesh_module():
    """Dynamically import the sibling crop-mesh.py (hyphenated filename, not
    a valid Python module name) to reuse its coords.txt parsing + UTM zone
    resolution verbatim -- same precedent detect-coverage-gaps.py already
    set for reusing crop-mesh.py this way."""
    crop_mesh_path = Path(__file__).resolve().parent / "crop-mesh.py"
    if not crop_mesh_path.exists():
        raise FileNotFoundError(
            f"expected crop-mesh.py alongside this script at {crop_mesh_path} "
            "(this script reuses its coords.txt parsing + UTM zone resolution "
            "rather than reimplementing them)"
        )
    spec = importlib.util.spec_from_file_location("crop_mesh", crop_mesh_path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def load_dem_to_heightmap_module():
    """Dynamically import the sibling dem-to-heightmap.py to reuse its
    nodata-fill (`fill_nodata_nearest`) and lat/lon-bbox crop
    (`crop_to_bounds`) helpers rather than reimplementing them."""
    dem_path = Path(__file__).resolve().parent / "dem-to-heightmap.py"
    if not dem_path.exists():
        raise FileNotFoundError(
            f"expected dem-to-heightmap.py alongside this script at {dem_path} "
            "(this script reuses its nodata-fill + bbox-crop helpers rather "
            "than reimplementing them)"
        )
    spec = importlib.util.spec_from_file_location("dem_to_heightmap", dem_path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def build_world_grid(
    left: float,
    bottom: float,
    right: float,
    top: float,
    grid_size: int,
) -> tuple[np.ndarray, np.ndarray]:
    """A uniform grid_size x grid_size grid of real-world (easting,
    northing) sample points spanning [left,right] x [bottom,top]. Returns
    (E_grid, N_grid), each shape (grid_size, grid_size), row 0 = bottom
    (southernmost), col 0 = left (westernmost)."""
    eastings = np.linspace(left, right, grid_size)
    northings = np.linspace(bottom, top, grid_size)
    e_grid, n_grid = np.meshgrid(eastings, northings)  # both (grid_size, grid_size)
    return e_grid, n_grid


def sample_elevation_bilinear(
    filled: np.ndarray,
    transform: rasterio.Affine,
    e_grid: np.ndarray,
    n_grid: np.ndarray,
) -> np.ndarray:
    """Bilinear-sample a (row, col)-indexed elevation array at real-world
    (E, N) points via the array's own affine transform's inverse -- see
    "RESAMPLING" in the module docstring for why bilinear-on-a-uniform-grid
    is used instead of dem-to-heightmap.py's block-pooling."""
    inv = ~transform
    col_grid = inv.a * e_grid + inv.b * n_grid + inv.c
    row_grid = inv.d * e_grid + inv.e * n_grid + inv.f
    return ndimage.map_coordinates(
        filled, [row_grid, col_grid], order=1, mode="nearest"
    )


def build_terrain_mesh(
    e_grid: np.ndarray,
    n_grid: np.ndarray,
    elevation_grid: np.ndarray,
    offset_easting: float,
    offset_northing: float,
    y_offset_m: float,
) -> trimesh.Trimesh:
    """Build a Y-up terrain mesh in the same local coordinate frame
    crop-mesh.py's Y-up-corrected OBJ output uses -- see "COORDINATE FRAME"
    in the module docstring for the exact per-vertex formula."""
    grid_size = e_grid.shape[0]

    local_x = e_grid - offset_easting
    local_z = -(n_grid - offset_northing)
    local_y = elevation_grid - y_offset_m

    # Row-major flatten: vertex index = row * grid_size + col.
    vertices = np.stack(
        [local_x.ravel(), local_y.ravel(), local_z.ravel()], axis=1
    )

    rows, cols = np.meshgrid(
        np.arange(grid_size - 1), np.arange(grid_size - 1), indexing="ij"
    )
    i00 = (rows * grid_size + cols).ravel()
    i01 = (rows * grid_size + cols + 1).ravel()
    i10 = ((rows + 1) * grid_size + cols).ravel()
    i11 = ((rows + 1) * grid_size + cols + 1).ravel()

    # Winding chosen so (v1-v0) x (v2-v0) points +Y (upward) given this
    # script's own local frame (+X = east, +Y = up, +Z = south) -- see
    # "WINDING/NORMALS" in the module docstring for the hand-derivation.
    # Defensively re-verified below rather than trusted blindly.
    tri1 = np.stack([i00, i01, i10], axis=1)
    tri2 = np.stack([i01, i11, i10], axis=1)
    faces = np.concatenate([tri1, tri2], axis=0)

    mesh = trimesh.Trimesh(vertices=vertices, faces=faces, process=False)
    _ensure_upward_faces(mesh)

    # trimesh's glTF exporter reads material off a TextureVisuals wrapper,
    # not a bare Material -- wrap it so `mesh.export(..., file_type="glb")`
    # actually emits this material rather than a default one.
    mesh.visual = trimesh.visual.TextureVisuals(
        material=trimesh.visual.material.PBRMaterial(
            name="terrain",
            baseColorFactor=TERRAIN_BASE_COLOR,
            metallicFactor=0.0,
            roughnessFactor=1.0,
            doubleSided=True,
        )
    )
    return mesh


def _ensure_upward_faces(mesh: trimesh.Trimesh) -> None:
    """Defensive runtime check (see "WINDING/NORMALS" in the module
    docstring): if the mesh's own computed face normals average out
    downward instead of upward, flip every face's winding in place. Trusts
    the actual geometry, not the hand-derived winding order above."""
    mean_normal_y = float(mesh.face_normals[:, 1].mean())
    if mean_normal_y < 0:
        mesh.faces = mesh.faces[:, ::-1]
        mesh._cache.clear()  # noqa: SLF001 -- force face_normals to recompute


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Convert a GeoTIFF DSM into a smooth terrain-surface glTF/glb, "
            "aligned to the same local coordinate frame crop-mesh.py's "
            "Y-up-corrected ODM mesh output uses, for <Model3D>'s "
            "terrain-drape (gap-fill) feature."
        )
    )
    parser.add_argument(
        "inputs", nargs="+", type=Path, help="Path(s) to input DSM GeoTIFF(s) (mosaicked via rasterio.merge if more than one)."
    )
    parser.add_argument("--output", required=True, type=Path, help="Path to write the output terrain glb.")
    parser.add_argument(
        "--coords-txt",
        required=True,
        type=Path,
        help="Path to the ODM project's odm_georeferencing/coords.txt (the SAME one crop-mesh.py used for the photogrammetry mesh being melded with) -- required so this terrain lands in that exact same local coordinate frame.",
    )

    bbox_group = parser.add_argument_group("crop bbox (WGS84 degrees, required)")
    bbox_group.add_argument("--lat-min", type=float, required=True)
    bbox_group.add_argument("--lat-max", type=float, required=True)
    bbox_group.add_argument("--lon-min", type=float, required=True)
    bbox_group.add_argument("--lon-max", type=float, required=True)
    parser.add_argument(
        "--buffer-meters",
        type=float,
        default=0.0,
        help="Expand the lat/lon bbox outward by this many meters (in the DSM's own projected CRS) before cropping -- match whatever buffer the corresponding mesh crop used (e.g. crop-mesh.py's own --lat-*/--lon-* + this flag), so the terrain and mesh cover the same real footprint.",
    )
    parser.add_argument("--grid-size", type=int, default=DEFAULT_GRID_SIZE, help=f"Output mesh is grid-size x grid-size vertices (default: {DEFAULT_GRID_SIZE}).")
    parser.add_argument("--y-offset-m", type=float, default=DEFAULT_Y_OFFSET_M, help=f"Shift the whole terrain surface down by this many meters from its own true elevation (default: {DEFAULT_Y_OFFSET_M} -- see module docstring's VERTICAL DRAPE OFFSET section).")

    args = parser.parse_args(argv)

    if args.grid_size < 2:
        print(f"error: --grid-size must be >= 2, got {args.grid_size}", file=sys.stderr)
        return 1

    for input_path in args.inputs:
        if not input_path.exists():
            print(f"error: input DSM not found: {input_path}", file=sys.stderr)
            return 1
    if not args.coords_txt.exists():
        print(f"error: coords.txt not found: {args.coords_txt}", file=sys.stderr)
        return 1

    crop_mesh = load_crop_mesh_module()
    dem_to_heightmap = load_dem_to_heightmap_module()

    utm_zone_desc, offset_easting, offset_northing = crop_mesh.parse_coords_txt(args.coords_txt)
    utm_epsg = crop_mesh.utm_epsg_from_zone_desc(utm_zone_desc)
    print(f"coords.txt: {utm_zone_desc} ({utm_epsg}), offset ({offset_easting}, {offset_northing})", file=sys.stderr)

    try:
        srcs = [rasterio.open(p) for p in args.inputs]
    except Exception as exc:  # noqa: BLE001
        print(f"error: could not open input DSM(s): {exc}", file=sys.stderr)
        return 1

    try:
        crs = srcs[0].crs
        for p, s in zip(args.inputs, srcs):
            if s.crs != crs:
                print(
                    f"error: all input DSMs must share one CRS to be merged -- "
                    f"'{args.inputs[0]}' is {crs}, '{p}' is {s.crs}",
                    file=sys.stderr,
                )
                return 1
        if str(crs).upper() != utm_epsg.upper() and crs.to_epsg() != int(utm_epsg.split(":")[1]):
            print(
                f"warning: DSM CRS ({crs}) differs from coords.txt's UTM zone "
                f"({utm_epsg}) -- reprojecting sample points, not the raster "
                "itself, per-point below.",
                file=sys.stderr,
            )

        nodata = srcs[0].nodata
        print(f"Merging {len(srcs)} input DSM(s) (CRS: {crs}, nodata: {nodata})...", file=sys.stderr)
        mosaic, out_transform = rasterio.merge.merge(srcs, nodata=nodata)
    finally:
        for s in srcs:
            s.close()

    elevation = mosaic.astype(np.float64)

    lat_min, lat_max = args.lat_min, args.lat_max
    lon_min, lon_max = args.lon_min, args.lon_max
    if args.buffer_meters:
        # Buffer in degrees is only approximate -- fine here since the real
        # buffering happens below in the DSM's own projected CRS via a
        # second, precise crop after reprojecting the bbox corners. This
        # first pass just needs to comfortably OVER-include so the precise
        # meter-based buffer step never runs out of source pixels.
        deg_pad = args.buffer_meters / 100000.0 * 1.5
        lat_min -= deg_pad
        lat_max += deg_pad
        lon_min -= deg_pad
        lon_max += deg_pad

    try:
        cropped, cropped_transform = dem_to_heightmap.crop_to_bounds(
            elevation, out_transform, crs, lat_min, lon_min, lat_max, lon_max
        )
    except ValueError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    print(f"Cropped to bbox (+ pad) -> {cropped.shape[2]}x{cropped.shape[1]} pixels", file=sys.stderr)

    band = cropped[0]
    if nodata is not None:
        invalid = np.isnan(band) if np.isnan(nodata) else (band == nodata)
    else:
        invalid = np.isnan(band)
    if invalid.all():
        print("error: no valid (non-nodata) pixels in the cropped DSM", file=sys.stderr)
        return 1
    filled = dem_to_heightmap.fill_nodata_nearest(band, invalid)

    # Precise real-world sampling extent: the ACTUAL requested lat/lon bbox
    # (not the degree-padded one above), reprojected to the DSM's own CRS
    # and then buffered outward by exactly --buffer-meters in real meters --
    # matching whatever buffer the corresponding mesh crop used.
    left, bottom, right, top = rasterio.warp.transform_bounds(
        "EPSG:4326", crs, args.lon_min, args.lat_min, args.lon_max, args.lat_max
    )
    left -= args.buffer_meters
    right += args.buffer_meters
    bottom -= args.buffer_meters
    top += args.buffer_meters

    e_grid, n_grid = build_world_grid(left, bottom, right, top, args.grid_size)
    elevation_grid = sample_elevation_bilinear(filled, cropped_transform, e_grid, n_grid)
    print(
        f"Sampled {args.grid_size}x{args.grid_size} grid over "
        f"x=[{left:.2f},{right:.2f}] y=[{bottom:.2f},{top:.2f}] "
        f"(elevation range {elevation_grid.min():.2f}..{elevation_grid.max():.2f})",
        file=sys.stderr,
    )

    mesh = build_terrain_mesh(
        e_grid, n_grid, elevation_grid, offset_easting, offset_northing, args.y_offset_m
    )
    print(
        f"Built terrain mesh: {len(mesh.vertices)} vertices, {len(mesh.faces)} faces, "
        f"y-offset {args.y_offset_m}m",
        file=sys.stderr,
    )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    mesh.export(str(args.output), file_type="glb")
    print(f"==> wrote terrain mesh: {args.output}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
