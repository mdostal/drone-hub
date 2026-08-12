#!/usr/bin/env python3
"""extract-contours.py — DSM/DTM -> elevation contour lines as GeoJSON.

Vectorizes elevation contour lines from a single-band elevation raster
(DSM or DTM) using `skimage.measure.find_contours` (marching squares),
simplifies each line with `skimage.measure.approximate_polygon`, and
reprojects pixel coordinates through the raster's real affine transform +
CRS into WGS84 lon/lat — the same technique already used to build this
repo's existing sample `contours.geojson`
(public/layer-viewer-samples/2806-prado/contours.geojson; see
docs/components/layer-viewer.md "Sample data provenance" for the prose
description this script formalizes into a reusable, parameterized tool).

Output shape matches the existing sample exactly: a GeoJSON
FeatureCollection of LineString features, each with
`properties: {elevationMeters: <float>, placeholder: <bool>}`.

GDAL's `gdal_contour` is the more standard CLI tool for this step in
environments that have the GDAL CLI installed (see pipeline/README.md §2)
— this script exists as the scikit-image-based alternative for
environments (like this one) that only have rasterio/scikit-image, not the
GDAL CLI.

Usage:
    extract-contours.py <input-dsm.tif> <output-contours.geojson> \\
        [--interval 2.5] [--simplify-tolerance 1.0] [--min-points 2]
"""
from __future__ import annotations

import argparse
import json
import math
import sys

import numpy as np
import rasterio
import rasterio.warp
from skimage import measure


def build_contours(
    elevation: np.ndarray,
    invalid: np.ndarray,
    transform: rasterio.Affine,
    src_crs,
    interval: float,
    simplify_tolerance: float,
    min_points: int,
    placeholder: bool,
) -> dict:
    valid = elevation[~invalid]
    if valid.size == 0:
        raise ValueError("no valid (non-nodata) pixels in input raster")

    vmin = float(valid.min())
    vmax = float(valid.max())

    # Fill nodata far below the valid range so marching squares never draws
    # a contour into the masked-out region (mirrors render_hillshade.py's
    # "keep nodata out of the computation, not fabricate data" approach,
    # but here a simple far-below-range fill is sufficient since we're not
    # differentiating/gradient-computing this array).
    fill_value = vmin - max(1.0, (vmax - vmin))
    filled = np.where(invalid, fill_value, elevation)

    start = math.ceil(vmin / interval) * interval
    end = math.floor(vmax / interval) * interval

    levels = []
    level = start
    while level <= end + 1e-9:
        levels.append(round(level, 6))
        level += interval

    features = []
    for level in levels:
        for contour in measure.find_contours(filled, level):
            if simplify_tolerance > 0:
                contour = measure.approximate_polygon(contour, tolerance=simplify_tolerance)
            if len(contour) < min_points:
                continue

            rows = contour[:, 0]
            cols = contour[:, 1]
            xs, ys = rasterio.transform.xy(transform, rows, cols)
            lons, lats = rasterio.warp.transform(src_crs, "EPSG:4326", xs, ys)

            coordinates = [[round(lon, 6), round(lat, 6)] for lon, lat in zip(lons, lats)]
            features.append(
                {
                    "type": "Feature",
                    "properties": {
                        "elevationMeters": float(level),
                        "placeholder": placeholder,
                    },
                    "geometry": {
                        "type": "LineString",
                        "coordinates": coordinates,
                    },
                }
            )

    return {"type": "FeatureCollection", "features": features}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Vectorize elevation contour lines from a DSM/DTM raster into a GeoJSON FeatureCollection."
    )
    parser.add_argument("input", help="Path to the input elevation raster (DSM/DTM), any CRS.")
    parser.add_argument("output", help="Path to write the output contours GeoJSON.")
    parser.add_argument(
        "--interval",
        type=float,
        default=2.5,
        help="Contour interval in the raster's elevation units (default: 2.5, matching this repo's existing sample).",
    )
    parser.add_argument(
        "--simplify-tolerance",
        type=float,
        default=1.0,
        dest="simplify_tolerance",
        help="Douglas-Peucker tolerance (in pixels) passed to skimage.measure.approximate_polygon (default: 1.0). 0 disables simplification.",
    )
    parser.add_argument(
        "--min-points",
        type=int,
        default=2,
        dest="min_points",
        help="Drop simplified contour lines with fewer than this many vertices (default: 2).",
    )
    parser.add_argument(
        "--placeholder",
        action="store_true",
        help="Set properties.placeholder to true on every feature (default: false — this script produces real contours from real input elevation data).",
    )
    args = parser.parse_args(argv)

    if args.interval <= 0:
        print(f"error: --interval must be positive, got {args.interval}", file=sys.stderr)
        return 1

    try:
        src = rasterio.open(args.input)
    except Exception as exc:  # noqa: BLE001
        print(f"error: could not open input raster '{args.input}': {exc}", file=sys.stderr)
        return 1

    with src:
        if src.count < 1:
            print(f"error: input raster '{args.input}' has no bands", file=sys.stderr)
            return 1

        elevation = src.read(1).astype(np.float64)
        nodata = src.nodata

        if nodata is not None:
            invalid = np.isnan(elevation) if np.isnan(nodata) else (elevation == nodata)
        else:
            invalid = np.isnan(elevation)

        if invalid.all():
            print(f"error: input raster '{args.input}' has no valid (non-nodata) pixels", file=sys.stderr)
            return 1

        try:
            geojson = build_contours(
                elevation,
                invalid,
                src.transform,
                src.crs,
                args.interval,
                args.simplify_tolerance,
                args.min_points,
                args.placeholder,
            )
        except ValueError as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 1

    if not geojson["features"]:
        print(
            f"error: produced zero contour features for '{args.input}' — "
            f"check --interval against the raster's real elevation range",
            file=sys.stderr,
        )
        return 1

    try:
        with open(args.output, "w") as f:
            json.dump(geojson, f)
    except OSError as exc:
        print(f"error: could not write output '{args.output}': {exc}", file=sys.stderr)
        return 1

    print(
        f"==> wrote {len(geojson['features'])} contour features: {args.output}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
