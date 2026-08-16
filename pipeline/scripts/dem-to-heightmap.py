#!/usr/bin/env python3
"""dem-to-heightmap.py — GeoTIFF DEM(s) -> VoxelTerrain's `heightmap.json`.

Formalizes an earlier, external proof-of-concept ("~15 lines of rasterio":
crop to a parcel bbox, block-pool to NxN, quantize elevation to height
bands) into a real, reusable, tested pipeline script. Output shape matches
this repo's real, already-consumed sample exactly — see
`public/minecraft-samples/2806-prado/heightmap.json` and the `VoxelGrid`
type it satisfies (`lib/voxel-types.ts`):

    { "slug": str, "title": str, "size": int, "heights": [int, ...] }

`heights` is a flat, ROW-MAJOR array of length `size*size` — `heights[row *
size + col]` — of small positive integers (the discrete height band, 1 =
lowest). `components/VoxelTerrain/voxel-geometry.ts`'s `terrainCells()` is
the real consumer: it stacks `height` unit cubes per cell, so the exact
integer matters (it's a block count), not just a display value.

PIPELINE STEPS (mirrors render_hillshade.py / extract-contours.py's rasterio
conventions — merge, nodata-fill, CRS handling — see pipeline/README.md):

  1. Open all input DEM(s) and, if more than one, mosaic them with
     `rasterio.merge.merge()` (same multi-tile pattern the story calls out;
     all inputs must share one CRS — this script errors clearly if not).
  2. Optionally crop to a real-world bounding box, given in WGS84 lat/lon
     (`--lat-min/--lat-max/--lon-min/--lon-max`, the same lat/lon-bbox
     naming convention crop-mesh.py already uses for the mesh-cropping
     step) and reprojected into the DEM's own CRS via
     `rasterio.warp.transform_bounds` before windowing. Omit all four flags
     to use the DEM's full extent.
  3. Fill nodata cells by nearest-neighbor (same technique
     render_hillshade.py's `fill_nodata_nearest` uses) so gradient-free but
     still-averaging pooling below doesn't get dragged toward an arbitrary
     nodata sentinel (e.g. -9999).
  4. BLOCK-POOL the (cropped, filled) elevation array down to a `--grid-
     size` x `--grid-size` grid (default 64) via `numpy.array_split` on
     each axis — which, unlike a reshape-based block-reduce, handles grid
     sizes that don't evenly divide the source raster's pixel dimensions
     (the common case for a real crop). POOLING METHOD DEFAULT: MEAN, not
     max (`--pooling max` is available). Reasoning: a real photogrammetry
     DSM is noisy at the single-pixel level (a tree edge, a parked car, a
     reconstruction speckle can spike one pixel well above its
     neighborhood); max-pooling a block that happens to contain one such
     outlier pixel would make that noise define the whole voxel cell's
     height. Mean-pooling averages it out, producing a height field that
     reads as the block's *typical* ground level — the more representative
     choice for a low-resolution blocky terrain read. `--pooling max` is
     still offered for callers who want peaks/ridgelines (e.g. tree
     canopy, roof ridges) to survive pooling instead of being smoothed away.
  5. QUANTIZE the pooled elevation grid into `--bands` discrete integer
     height levels (default 8, matching the real range used by this
     repo's own shipped sample), 1..bands inclusive (1 = the pooled grid's
     own minimum elevation, `bands` = its own maximum) via linear binning
     over the pooled grid's own min/max range.
  6. Emit `heightmap.json` in VoxelGrid shape.

No property-specific coordinates, paths, or defaults are hardcoded anywhere
in this script — slug/title/bounds/grid-size/bands are all CLI arguments.

Usage:
    dem-to-heightmap.py <input-dem.tif> [<input-dem2.tif> ...] \\
        --output heightmap.json --slug 2806-prado --title "2806 Prado" \\
        [--grid-size 64] [--bands 8] [--pooling mean|max] \\
        [--lat-min <deg> --lat-max <deg> --lon-min <deg> --lon-max <deg>]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import rasterio
import rasterio.merge
import rasterio.warp
import rasterio.windows


def fill_nodata_nearest(elevation: np.ndarray, invalid: np.ndarray) -> np.ndarray:
    """Nearest-neighbor fill of invalid (nodata) cells.

    Same technique as render_hillshade.py's identically-named helper (see
    that script's docstring for why: unfilled nodata sentinels like -9999
    would otherwise dominate mean-pooling for any block that touches them).
    """
    if not invalid.any() or invalid.all():
        return elevation
    from scipy import ndimage

    indices = ndimage.distance_transform_edt(invalid, return_distances=False, return_indices=True)
    return elevation[tuple(indices)]


def crop_to_bounds(
    mosaic: np.ndarray,
    transform: rasterio.Affine,
    crs,
    lat_min: float,
    lon_min: float,
    lat_max: float,
    lon_max: float,
) -> tuple[np.ndarray, rasterio.Affine]:
    """Crop a (1, H, W) mosaic array to a WGS84 lat/lon bbox, reprojected
    into the mosaic's own CRS first. Returns (cropped_array, cropped_
    transform) -- the cropped array keeps the leading band axis."""
    left, bottom, right, top = rasterio.warp.transform_bounds(
        "EPSG:4326", crs, lon_min, lat_min, lon_max, lat_max
    )
    window = rasterio.windows.from_bounds(left, bottom, right, top, transform=transform)
    window = window.round_offsets().round_lengths()
    row_off = max(0, int(window.row_off))
    col_off = max(0, int(window.col_off))
    row_stop = min(mosaic.shape[1], row_off + int(window.height))
    col_stop = min(mosaic.shape[2], col_off + int(window.width))
    if row_stop <= row_off or col_stop <= col_off:
        raise ValueError(
            "crop bounds do not overlap the DEM's real extent -- check that "
            "--lat-min/--lat-max/--lon-min/--lon-max are given in WGS84 "
            "degrees and actually intersect the input raster(s)"
        )
    cropped = mosaic[:, row_off:row_stop, col_off:col_stop]
    cropped_transform = transform * rasterio.Affine.translation(col_off, row_off)
    return cropped, cropped_transform


def block_pool(array: np.ndarray, grid_size: int, method: str) -> np.ndarray:
    """Pools a 2D elevation array down to grid_size x grid_size, one output
    cell per (row-chunk, col-chunk) of `np.array_split` -- unlike a
    reshape-based block-reduce, this handles source dimensions that don't
    evenly divide grid_size (the normal case after a real-world crop),
    trading perfectly-equal block sizes for "as equal as np.array_split can
    make them" (off by at most one row/column per chunk)."""
    if array.shape[0] < grid_size or array.shape[1] < grid_size:
        raise ValueError(
            f"cropped DEM is {array.shape[1]}x{array.shape[0]} pixels, too small to "
            f"block-pool down to a {grid_size}x{grid_size} grid -- use a smaller "
            "--grid-size, a wider crop bbox, or a higher-resolution input DEM"
        )
    reducer = np.mean if method == "mean" else np.max
    row_chunks = np.array_split(array, grid_size, axis=0)
    pooled = np.empty((grid_size, grid_size), dtype=np.float64)
    for r, row_chunk in enumerate(row_chunks):
        col_chunks = np.array_split(row_chunk, grid_size, axis=1)
        for c, block in enumerate(col_chunks):
            pooled[r, c] = reducer(block)
    return pooled


def quantize_to_bands(pooled: np.ndarray, bands: int) -> np.ndarray:
    """Linearly bins a pooled elevation grid into `bands` discrete integer
    levels, 1..bands inclusive (1 = the grid's own minimum, bands = its own
    maximum) -- the same 1-indexed convention VoxelTerrain's
    `classifyHeightBand`/`terrainCells` expect (stackLevel 1 = the ground
    layer)."""
    vmin = float(pooled.min())
    vmax = float(pooled.max())
    if vmax == vmin:
        # Perfectly flat pooled grid (e.g. a tiny crop) -- every cell is the
        # same single band rather than dividing by zero.
        return np.ones(pooled.shape, dtype=np.int64)
    normalized = (pooled - vmin) / (vmax - vmin)
    levels = 1 + np.floor(normalized * bands)
    return np.clip(levels, 1, bands).astype(np.int64)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Convert one or more GeoTIFF DEM tiles into a VoxelTerrain "
            "heightmap.json: crop to an optional real-world bbox, "
            "block-pool to a fixed grid, quantize elevation to discrete "
            "height bands."
        )
    )
    parser.add_argument("inputs", nargs="+", type=Path, help="Path(s) to input DEM GeoTIFF(s) (DSM or DTM). Multiple tiles are mosaicked via rasterio.merge.")
    parser.add_argument("--output", required=True, type=Path, help="Path to write the output heightmap.json.")
    parser.add_argument("--slug", required=True, help="Stable slug identifying the source property (VoxelGrid.slug).")
    parser.add_argument("--title", required=True, help="Human-readable title (VoxelGrid.title).")
    parser.add_argument("--grid-size", type=int, default=64, dest="grid_size", help="Output grid is grid-size x grid-size cells (default: 64).")
    parser.add_argument("--bands", type=int, default=8, help="Number of discrete integer height bands to quantize elevation into (default: 8, matching this repo's shipped sample's real range).")
    parser.add_argument("--pooling", choices=["mean", "max"], default="mean", help="Block-pooling reducer (default: mean -- see this script's module docstring for why mean is the default over max).")

    bbox_group = parser.add_argument_group("optional crop bbox (WGS84 degrees; omit all four to use the DEM's full extent)")
    bbox_group.add_argument("--lat-min", type=float, dest="lat_min")
    bbox_group.add_argument("--lat-max", type=float, dest="lat_max")
    bbox_group.add_argument("--lon-min", type=float, dest="lon_min")
    bbox_group.add_argument("--lon-max", type=float, dest="lon_max")

    args = parser.parse_args(argv)

    if args.grid_size < 1:
        print(f"error: --grid-size must be positive, got {args.grid_size}", file=sys.stderr)
        return 1
    if args.bands < 1:
        print(f"error: --bands must be positive, got {args.bands}", file=sys.stderr)
        return 1

    bbox_fields = (args.lat_min, args.lat_max, args.lon_min, args.lon_max)
    using_bbox = any(v is not None for v in bbox_fields)
    if using_bbox and any(v is None for v in bbox_fields):
        print(
            "error: --lat-min/--lat-max/--lon-min/--lon-max must be given together "
            "(or not at all, to use the DEM's full extent)",
            file=sys.stderr,
        )
        return 1

    for input_path in args.inputs:
        if not input_path.exists():
            print(f"error: input DEM not found: {input_path}", file=sys.stderr)
            return 1

    try:
        srcs = [rasterio.open(p) for p in args.inputs]
    except Exception as exc:  # noqa: BLE001
        print(f"error: could not open input DEM(s): {exc}", file=sys.stderr)
        return 1

    try:
        crs = srcs[0].crs
        for p, s in zip(args.inputs, srcs):
            if s.crs != crs:
                print(
                    f"error: all input DEMs must share one CRS to be merged -- "
                    f"'{args.inputs[0]}' is {crs}, '{p}' is {s.crs}",
                    file=sys.stderr,
                )
                return 1

        nodata = srcs[0].nodata
        print(f"Merging {len(srcs)} input DEM(s) (CRS: {crs}, nodata: {nodata})...", file=sys.stderr)
        mosaic, out_transform = rasterio.merge.merge(srcs, nodata=nodata)
    finally:
        for s in srcs:
            s.close()

    elevation = mosaic.astype(np.float64)

    if using_bbox:
        try:
            elevation, out_transform = crop_to_bounds(
                elevation, out_transform, crs, args.lat_min, args.lon_min, args.lat_max, args.lon_max
            )
        except ValueError as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 1
        print(f"Cropped to bbox -> {elevation.shape[2]}x{elevation.shape[1]} pixels", file=sys.stderr)
    else:
        print(f"Using full DEM extent -> {elevation.shape[2]}x{elevation.shape[1]} pixels", file=sys.stderr)

    band = elevation[0]
    if nodata is not None:
        invalid = np.isnan(band) if np.isnan(nodata) else (band == nodata)
    else:
        invalid = np.isnan(band)

    if invalid.all():
        print("error: no valid (non-nodata) pixels in the cropped DEM", file=sys.stderr)
        return 1

    filled = fill_nodata_nearest(band, invalid)

    try:
        pooled = block_pool(filled, args.grid_size, args.pooling)
    except ValueError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    levels = quantize_to_bands(pooled, args.bands)
    print(
        f"Pooled to {args.grid_size}x{args.grid_size} ({args.pooling}), "
        f"quantized to {args.bands} bands "
        f"(elevation range {pooled.min():.2f}..{pooled.max():.2f})",
        file=sys.stderr,
    )

    heightmap = {
        "slug": args.slug,
        "title": args.title,
        "size": args.grid_size,
        # row-major flatten (numpy default 'C' order) -- heights[row*size+col]
        "heights": levels.flatten().tolist(),
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    try:
        with open(args.output, "w") as f:
            json.dump(heightmap, f)
    except OSError as exc:
        print(f"error: could not write output '{args.output}': {exc}", file=sys.stderr)
        return 1

    print(f"==> wrote heightmap: {args.output}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
