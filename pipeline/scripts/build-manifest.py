#!/usr/bin/env python3
"""build-manifest.py — assemble a property's `layers.json` (and optional
model manifest) from the upstream pipeline scripts' output paths.

This is the final step pipeline/README.md's mapping describes as "automated":
given the file paths produced by reproject-ortho.sh (ortho COG),
render-hillshade.sh (hillshade COG), extract-contours.py (contours GeoJSON),
and convert-mesh.sh/crop-mesh.py (textured-mesh glb) — plus a parcel boundary
GeoJSON, wherever that comes from for a given property — this script writes:

  * `layers.json` — a `PropertyLayers` object (`lib/layer-types.ts`),
    structurally identical to the real, working reference manifest at
    public/layer-viewer-samples/2806-prado/layers.json.
  * a model manifest (default `model.json`), only when `--mesh` is given —
    a plain `ModelDef` (`components/Model3D/Model3D.tsx`) by default, or a
    `GeoAnchoredModel` (`lib/geo-model-types.ts`) when `--geo-anchor <lat>
    <lon>` is also given. These are deliberately different, non-overlapping
    shapes (see geo-model-types.ts's header comment) — this script never
    merges them.

Every property-specific value (slug, title, lat/lon, file paths) comes from
CLI arguments — nothing property-specific is hardcoded here. The default
opacities/toggles/legend text below are generic, framework-level defaults
(the same shape/wording this repo's own real 2806-prado sample manifest
uses), not tied to any one property, and every one of them is overridable
via a flag.

Usage:
    build-manifest.py <slug> <title> --output-dir <dir> \\
        --ortho ortho.tif --hillshade hillshade.tif \\
        --boundary parcel.geojson --contours contours.geojson \\
        --mesh model.glb [--geo-anchor <lat> <lon>]

Each of --ortho/--hillshade/--boundary/--contours/--mesh is independently
optional — pass whichever of that run's outputs actually exist. `url` in
the emitted JSON is always the basename of the given path (layers.json and
its data files are expected to live side by side in one output property
folder — see components/LayerViewer/LayerViewer.tsx's `resolveManifest` doc
comment for why a bare, non-root-absolute filename is required).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any

# --- Generic, non-property-specific defaults --------------------------------
# Every one of these is a framework-level default describing what the
# upstream scripts in this repo produce in general, not any one property's
# data. All are overridable via CLI flags.

DEFAULT_ORTHO_LEGEND = "orthomosaic reconstructed by OpenDroneMap/WebODM from the property's nadir flight pass(es)"
DEFAULT_HILLSHADE_LEGEND = "hillshade derived from the ODM-reconstructed DSM"
DEFAULT_BOUNDARY_LEGEND = "approximate reconstruction footprint — not a surveyed parcel boundary"
DEFAULT_CONTOURS_LEGEND = "elevation contours derived from the ODM-reconstructed DSM"
DEFAULT_THERMAL_LEGEND = "ironbow — stub until a radiometric sensor is acquired"
DEFAULT_CONTOURS_LINE_COLOR = "#38bdf8"

DEFAULT_ORTHO_OPACITY = 1.0
DEFAULT_HILLSHADE_OPACITY = 0.6
DEFAULT_BOUNDARY_OPACITY = 1.0
DEFAULT_CONTOURS_OPACITY = 1.0
DEFAULT_THERMAL_OPACITY = 1.0

DEFAULT_MESH_ID = "textured-mesh"


def _num(value: float) -> float | int:
    """Collapse a whole-number float to a plain int before JSON-serializing
    (e.g. 1.0 -> 1, 0.6 stays 0.6) — cosmetic only (`number` in TS/JSON makes
    no int/float distinction), but matches the real sample manifest's own
    literal style (`"opacity": 1`, not `"opacity": 1.0`)."""
    return int(value) if float(value).is_integer() else value


def _layer_def(
    layer_id: str,
    layer_type: str,
    url: str | None,
    opacity: float,
    toggle: bool,
    *,
    fmt: str | None = None,
    disabled: bool | None = None,
    legend: str | None = None,
    style: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build one `LayerDef` dict with keys inserted in the exact field order
    lib/layer-types.ts declares them (and the real sample manifest uses):
    id, type, [format], url, opacity, toggle, [disabled], [legend], [style].
    Optional fields are OMITTED (not written as null/false) when not given,
    matching the sample's own shape exactly."""
    layer: dict[str, Any] = {"id": layer_id, "type": layer_type}
    if fmt is not None:
        layer["format"] = fmt
    layer["url"] = url
    layer["opacity"] = _num(opacity)
    layer["toggle"] = toggle
    if disabled is not None:
        layer["disabled"] = disabled
    if legend is not None:
        layer["legend"] = legend
    if style is not None:
        layer["style"] = style
    return layer


def build_layers(args: argparse.Namespace) -> list[dict[str, Any]]:
    layers: list[dict[str, Any]] = []

    if args.ortho is not None:
        layers.append(
            _layer_def(
                "ortho",
                "raster",
                os.path.basename(args.ortho),
                args.ortho_opacity,
                args.ortho_toggle,
                fmt="cog",
                legend=args.ortho_legend,
            )
        )

    if args.hillshade is not None:
        layers.append(
            _layer_def(
                "hillshade",
                "raster",
                os.path.basename(args.hillshade),
                args.hillshade_opacity,
                args.hillshade_toggle,
                fmt="cog",
                legend=args.hillshade_legend,
            )
        )

    if args.boundary is not None:
        layers.append(
            _layer_def(
                "boundary",
                "geojson",
                os.path.basename(args.boundary),
                args.boundary_opacity,
                args.boundary_toggle,
                legend=args.boundary_legend,
            )
        )

    if args.thermal_stub:
        layers.append(
            _layer_def(
                "thermal",
                "raster",
                None,
                args.thermal_opacity,
                False,
                disabled=True,
                legend=args.thermal_legend,
            )
        )

    if args.contours is not None:
        style = None
        if args.contours_style:
            style = {"lineColor": args.contours_line_color, "lineOnly": True}
        layers.append(
            _layer_def(
                "contours",
                "geojson",
                os.path.basename(args.contours),
                args.contours_opacity,
                args.contours_toggle,
                legend=args.contours_legend,
                style=style,
            )
        )

    return layers


def build_model_entry(args: argparse.Namespace) -> dict[str, Any] | None:
    """Returns a plain `ModelDef` dict, a `GeoAnchoredModel` dict, or None
    if no --mesh was given."""
    if args.mesh is None:
        return None

    mesh_id = args.mesh_id or DEFAULT_MESH_ID
    mesh_title = args.mesh_title or f"{args.title} — textured mesh"
    url = os.path.basename(args.mesh)

    if args.geo_anchor is not None:
        lat, lon = args.geo_anchor
        model: dict[str, Any] = {
            "id": mesh_id,
            "url": url,
            "title": mesh_title,
            "lat": lat,
            "lon": lon,
        }
        if args.altitude_meters is not None:
            model["altitudeMeters"] = _num(args.altitude_meters)
        if args.rotation_degrees is not None:
            model["rotationDegrees"] = _num(args.rotation_degrees)
        if args.scale is not None:
            model["scale"] = _num(args.scale)
        if args.units_per_meter is not None:
            print(
                "warning: --units-per-meter is a ModelDef-only field and is ignored "
                "when --geo-anchor is set (GeoAnchoredModel has no such field)",
                file=sys.stderr,
            )
        return model

    model = {"id": mesh_id, "url": url, "title": mesh_title}
    if args.units_per_meter is not None:
        model["unitsPerMeter"] = _num(args.units_per_meter)
    for flag_name, value in (
        ("--altitude-meters", args.altitude_meters),
        ("--rotation-degrees", args.rotation_degrees),
        ("--scale", args.scale),
    ):
        if value is not None:
            print(
                f"warning: {flag_name} is a GeoAnchoredModel-only field and is ignored "
                "without --geo-anchor (ModelDef has no such field)",
                file=sys.stderr,
            )
    return model


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Assemble a property's layers.json (PropertyLayers, lib/layer-types.ts) "
            "and, optionally, a model manifest (ModelDef or GeoAnchoredModel) from "
            "the upstream pipeline scripts' output file paths."
        )
    )
    parser.add_argument("slug", help="Property slug, e.g. '2806-prado'.")
    parser.add_argument("title", help="Property display title, e.g. '2806 Prado'.")
    parser.add_argument(
        "--output-dir",
        required=True,
        help="Directory to write the manifest file(s) into (created if missing).",
    )
    parser.add_argument("--layers-filename", default="layers.json", help="Output filename for the layer manifest (default: layers.json).")
    parser.add_argument("--model-filename", default="model.json", help="Output filename for the model manifest, only written if --mesh is given (default: model.json).")
    parser.add_argument("--pretty", dest="pretty", action="store_true", default=True, help="Pretty-print JSON output with 2-space indent (default: on).")
    parser.add_argument("--compact", dest="pretty", action="store_false", help="Write compact (non-indented) JSON instead of --pretty.")
    parser.add_argument(
        "--skip-file-checks",
        action="store_true",
        help="Don't verify that --ortho/--hillshade/--boundary/--contours/--mesh paths exist on disk before writing the manifest.",
    )

    ortho = parser.add_argument_group("ortho layer")
    ortho.add_argument("--ortho", help="Path to the reprojected ortho COG (reproject-ortho.sh's output).")
    ortho.add_argument("--ortho-opacity", type=float, default=DEFAULT_ORTHO_OPACITY)
    ortho.add_argument("--ortho-toggle", action="store_true", default=True)
    ortho.add_argument("--no-ortho-toggle", dest="ortho_toggle", action="store_false")
    ortho.add_argument("--ortho-legend", default=DEFAULT_ORTHO_LEGEND)

    hillshade = parser.add_argument_group("hillshade layer")
    hillshade.add_argument("--hillshade", help="Path to the reprojected hillshade COG (render-hillshade.sh's output).")
    hillshade.add_argument("--hillshade-opacity", type=float, default=DEFAULT_HILLSHADE_OPACITY)
    hillshade.add_argument("--hillshade-toggle", action="store_true", default=False)
    hillshade.add_argument("--no-hillshade-toggle", dest="hillshade_toggle", action="store_false")
    hillshade.add_argument("--hillshade-legend", default=DEFAULT_HILLSHADE_LEGEND)

    boundary = parser.add_argument_group("boundary layer")
    boundary.add_argument("--boundary", help="Path to the parcel boundary GeoJSON.")
    boundary.add_argument("--boundary-opacity", type=float, default=DEFAULT_BOUNDARY_OPACITY)
    boundary.add_argument("--boundary-toggle", action="store_true", default=True)
    boundary.add_argument("--no-boundary-toggle", dest="boundary_toggle", action="store_false")
    boundary.add_argument("--boundary-legend", default=DEFAULT_BOUNDARY_LEGEND)

    contours = parser.add_argument_group("contours layer")
    contours.add_argument("--contours", help="Path to the contours GeoJSON (extract-contours.py's output).")
    contours.add_argument("--contours-opacity", type=float, default=DEFAULT_CONTOURS_OPACITY)
    contours.add_argument("--contours-toggle", action="store_true", default=False)
    contours.add_argument("--no-contours-toggle", dest="contours_toggle", action="store_false")
    contours.add_argument("--contours-legend", default=DEFAULT_CONTOURS_LEGEND)
    contours.add_argument("--contours-line-color", default=DEFAULT_CONTOURS_LINE_COLOR)
    contours.add_argument("--contours-style", action="store_true", default=True, help="Emit a lineOnly style block (default: on).")
    contours.add_argument("--no-contours-style", dest="contours_style", action="store_false")

    thermal = parser.add_argument_group("thermal stub layer")
    thermal.add_argument(
        "--thermal-stub",
        action="store_true",
        default=True,
        help="Include the disabled thermal stub slot (default: on — CBA's 'preview the full layer set' rule; no radiometric sensor exists yet).",
    )
    thermal.add_argument("--no-thermal-stub", dest="thermal_stub", action="store_false")
    thermal.add_argument("--thermal-opacity", type=float, default=DEFAULT_THERMAL_OPACITY)
    thermal.add_argument("--thermal-legend", default=DEFAULT_THERMAL_LEGEND)

    mesh = parser.add_argument_group("model / mesh")
    mesh.add_argument("--mesh", help="Path to the converted glb (convert-mesh.sh's output).")
    mesh.add_argument("--mesh-id", default=None, help=f"Model id (default: '{DEFAULT_MESH_ID}').")
    mesh.add_argument("--mesh-title", default=None, help="Model title (default: '<title> — textured mesh').")
    mesh.add_argument("--units-per-meter", type=float, default=None, help="ModelDef.unitsPerMeter — only used without --geo-anchor.")
    mesh.add_argument(
        "--geo-anchor",
        nargs=2,
        type=float,
        metavar=("LAT", "LON"),
        default=None,
        help="Emit a GeoAnchoredModel (lib/geo-model-types.ts) instead of a plain ModelDef, anchored at this real-world lat/lon.",
    )
    mesh.add_argument("--altitude-meters", type=float, default=None, help="GeoAnchoredModel.altitudeMeters — only used with --geo-anchor.")
    mesh.add_argument("--rotation-degrees", type=float, default=None, help="GeoAnchoredModel.rotationDegrees — only used with --geo-anchor.")
    mesh.add_argument("--scale", type=float, default=None, help="GeoAnchoredModel.scale — only used with --geo-anchor.")

    args = parser.parse_args(argv)

    if args.geo_anchor is not None and args.mesh is None:
        parser.error("--geo-anchor requires --mesh (there is no model to anchor)")

    return args


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    if not args.skip_file_checks:
        for flag, path in (
            ("--ortho", args.ortho),
            ("--hillshade", args.hillshade),
            ("--boundary", args.boundary),
            ("--contours", args.contours),
            ("--mesh", args.mesh),
        ):
            if path is not None and not os.path.isfile(path):
                print(f"error: {flag} path not found: {path}", file=sys.stderr)
                return 1

    layers = build_layers(args)
    model_entry = build_model_entry(args)

    if not layers and model_entry is None:
        print(
            "error: nothing to write — pass at least one of --ortho/--hillshade/"
            "--boundary/--contours/--mesh, or leave --thermal-stub on its default",
            file=sys.stderr,
        )
        return 1

    os.makedirs(args.output_dir, exist_ok=True)
    indent = 2 if args.pretty else None

    property_layers = {"slug": args.slug, "title": args.title, "layers": layers}
    layers_path = os.path.join(args.output_dir, args.layers_filename)
    with open(layers_path, "w") as f:
        json.dump(property_layers, f, indent=indent, ensure_ascii=False)
        f.write("\n")
    print(f"==> wrote {len(layers)} layer(s): {layers_path}", file=sys.stderr)

    if model_entry is not None:
        model_path = os.path.join(args.output_dir, args.model_filename)
        with open(model_path, "w") as f:
            json.dump(model_entry, f, indent=indent, ensure_ascii=False)
            f.write("\n")
        kind = "GeoAnchoredModel" if args.geo_anchor is not None else "ModelDef"
        print(f"==> wrote {kind}: {model_path}", file=sys.stderr)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
