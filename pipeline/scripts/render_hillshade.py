#!/usr/bin/env python3
"""render_hillshade.py — rasterio/numpy slope-aspect hillshade.

WHY THIS EXISTS INSTEAD OF CALLING `gdaldem` DIRECTLY: this environment does
not have the GDAL CLI tools installed (`which gdaldem` fails), only
`rasterio`/`rio` (which vendor their own GDAL bindings, not the CLI). This
script is a drop-in stand-in for the raster-math step of:

    gdaldem hillshade -az 315 -alt 45 <input-dsm.tif> <output-hillshade.tif>

If your environment DOES have GDAL's CLI installed, that `gdaldem` command
is the standard, simpler equivalent — see pipeline/README.md §2. Both compute
the same illumination model; this script exists purely to remove the GDAL
CLI dependency, not to change the algorithm.

ALGORITHM: a standard slope/aspect hillshade (the Burrough & McDonell
illumination model gdaldem's default `-alg Horn` also implements), evaluated
at azimuth 315°/altitude 45° by default — the same convention already used
for this repo's existing hillshade sample data (see
docs/components/layer-viewer.md "Sample data provenance").

INPUT: a single-band elevation raster (DSM or DTM), any CRS. Assumes a
projected CRS with meters-based pixel spacing (true of WebODM/ODM's default
UTM output) — pass --z-factor to correct if elevation and horizontal units
differ (e.g. geographic degrees).

OUTPUT: a single-band uint8 GeoTIFF, same CRS/transform/extent as the input,
with nodata=0 wherever the input was nodata. This is an intermediate file —
it is NOT reprojected to EPSG:3857 or COG-tiled; render-hillshade.sh (the
shell wrapper that calls this script) does that afterward via the same
`rio warp` / `rio cogeo create` / `rio cogeo validate` chain reproject-ortho.sh
uses.

Usage:
    render_hillshade.py <input-dsm.tif> <output-hillshade.tif> \\
        [--az 315] [--alt 45] [--z-factor 1.0]
"""
from __future__ import annotations

import argparse
import sys

import numpy as np
import rasterio


def compute_hillshade(
    elevation: np.ndarray,
    xres: float,
    yres: float,
    azimuth: float = 315.0,
    altitude: float = 45.0,
    z_factor: float = 1.0,
) -> np.ndarray:
    """Standard slope/aspect hillshade, illuminated from (azimuth, altitude).

    `elevation` must already have nodata cells filled (see main()) — this
    function does no masking itself, it only computes the illumination
    model over whatever array it's given.

    Returns a float array in [-1, 1]; caller rescales to uint8.
    """
    scaled = elevation.astype(np.float64) * z_factor
    # np.gradient(f, d0, d1) -> (df/d(axis0), df/d(axis1)) i.e. (row-direction
    # gradient scaled by yres, col-direction gradient scaled by xres).
    dz_drow, dz_dcol = np.gradient(scaled, yres, xres)

    slope = np.pi / 2.0 - np.arctan(np.hypot(dz_dcol, dz_drow))
    aspect = np.arctan2(-dz_dcol, dz_drow)

    az_rad = np.deg2rad(360.0 - azimuth)
    alt_rad = np.deg2rad(altitude)

    shaded = np.sin(alt_rad) * np.sin(slope) + np.cos(alt_rad) * np.cos(
        slope
    ) * np.cos((az_rad - np.pi / 2.0) - aspect)

    return shaded


def fill_nodata_nearest(elevation: np.ndarray, invalid: np.ndarray) -> np.ndarray:
    """Nearest-neighbor fill of invalid (nodata) cells.

    Gradient-based ops blow up at an arbitrary nodata sentinel (e.g. -9999),
    which would otherwise bleed a ring of garbage hillshade values into the
    valid interior near any nodata boundary. Nearest-fill first, compute the
    hillshade, then re-mask to nodata afterward (see main()).
    """
    if not invalid.any() or invalid.all():
        return elevation
    from scipy import ndimage

    indices = ndimage.distance_transform_edt(
        invalid, return_distances=False, return_indices=True
    )
    return elevation[tuple(indices)]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Compute a slope/aspect hillshade from an elevation raster (rasterio/numpy stand-in for `gdaldem hillshade`)."
    )
    parser.add_argument("input", help="Path to the input elevation raster (DSM/DTM), any CRS.")
    parser.add_argument("output", help="Path to write the single-band uint8 hillshade GeoTIFF.")
    parser.add_argument("--az", type=float, default=315.0, help="Illumination azimuth in degrees (default: 315).")
    parser.add_argument("--alt", type=float, default=45.0, help="Illumination altitude in degrees (default: 45).")
    parser.add_argument(
        "--z-factor",
        type=float,
        default=1.0,
        dest="z_factor",
        help="Vertical exaggeration / unit-correction factor applied to elevation before computing slope (default: 1.0).",
    )
    args = parser.parse_args(argv)

    try:
        src = rasterio.open(args.input)
    except Exception as exc:  # noqa: BLE001 - want a clear stderr message either way
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

        xres = abs(src.transform.a)
        yres = abs(src.transform.e)
        if xres == 0 or yres == 0:
            print(f"error: input raster '{args.input}' has zero pixel size in its transform", file=sys.stderr)
            return 1

        filled = fill_nodata_nearest(elevation, invalid)
        shaded = compute_hillshade(filled, xres, yres, args.az, args.alt, args.z_factor)

        # Rescale [-1, 1] -> [1, 255], reserving 0 for nodata.
        scaled = np.clip(1 + (shaded + 1.0) * (254.0 / 2.0), 1, 255)
        output = scaled.astype(np.uint8)
        output[invalid] = 0

        profile = src.profile.copy()
        profile.update(
            count=1,
            dtype="uint8",
            nodata=0,
            driver="GTiff",
            compress="deflate",
        )

    try:
        with rasterio.open(args.output, "w", **profile) as dst:
            dst.write(output, 1)
    except Exception as exc:  # noqa: BLE001
        print(f"error: could not write output raster '{args.output}': {exc}", file=sys.stderr)
        return 1

    print(f"==> wrote hillshade: {args.output}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
