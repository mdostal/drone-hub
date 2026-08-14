import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { LayerDef, PropertyLayers } from "@/lib/layer-types";
import manifestJson from "./layers.json";

// Verification for the layer-viewer-sample-data story. Kept (not throwaway)
// so it re-runs under `npm run test` and catches drift if the sample data
// or lib/layer-types.ts shape ever changes.
//
// `manifestJson` is imported via tsconfig's resolveJsonModule, but plain
// JSON imports widen string-literal fields to `string` (TypeScript can't
// infer `"raster" | "geojson"` from JSON), so a bare `const x: PropertyLayers
// = manifestJson` doesn't actually exercise the union types. Instead,
// `assertPropertyLayers` below is a runtime type-guard against
// lib/layer-types.ts's exact shape (including the `type`/`format` unions) -
// this both type-checks at compile time (its `asserts` signature is checked
// by `tsc`/`npm run build`) and proves the *actual* JSON content is valid at
// runtime, which a blind cast would not.

function assertLayerDef(x: unknown, index: number): asserts x is LayerDef {
  expect(x, `layers[${index}] should be an object`).toBeTypeOf("object");
  const l = x as Record<string, unknown>;
  expect(typeof l.id, `layers[${index}].id`).toBe("string");
  expect(["raster", "geojson"], `layers[${index}].type`).toContain(l.type);
  expect(
    l.url === null || typeof l.url === "string",
    `layers[${index}].url should be string | null`,
  ).toBe(true);
  expect(typeof l.opacity, `layers[${index}].opacity`).toBe("number");
  expect(typeof l.toggle, `layers[${index}].toggle`).toBe("boolean");
  if ("disabled" in l) expect(typeof l.disabled, `layers[${index}].disabled`).toBe("boolean");
  if ("legend" in l) expect(typeof l.legend, `layers[${index}].legend`).toBe("string");
  if ("format" in l) expect(["cog", "xyz"], `layers[${index}].format`).toContain(l.format);
  if ("style" in l) {
    expect(l.style, `layers[${index}].style`).toBeTypeOf("object");
    const s = l.style as Record<string, unknown>;
    if ("fillColor" in s) expect(typeof s.fillColor, `layers[${index}].style.fillColor`).toBe("string");
    if ("lineColor" in s) expect(typeof s.lineColor, `layers[${index}].style.lineColor`).toBe("string");
    if ("lineOnly" in s) expect(typeof s.lineOnly, `layers[${index}].style.lineOnly`).toBe("boolean");
  }
}

function assertPropertyLayers(x: unknown): asserts x is PropertyLayers {
  expect(x).toBeTypeOf("object");
  const p = x as Record<string, unknown>;
  expect(typeof p.slug).toBe("string");
  expect(typeof p.title).toBe("string");
  expect(Array.isArray(p.layers)).toBe(true);
  (p.layers as unknown[]).forEach((l, i) => assertLayerDef(l, i));
}

const sampleDir = path.dirname(new URL(import.meta.url).pathname);

describe("2806-prado sample manifest", () => {
  it("runtime-validates and type-checks as a valid PropertyLayers", () => {
    const raw: unknown = manifestJson;
    assertPropertyLayers(raw);
    const manifest: PropertyLayers = raw; // narrowed by the assertion above, no cast needed
    expect(manifest.slug).toBe("2806-prado");
    expect(manifest.title).toBe("2806 Prado (real photogrammetry sample)");
    expect(Array.isArray(manifest.layers)).toBe(true);
  });

  it("has exactly the six expected layer ids", () => {
    const ids = manifestJson.layers.map((l) => l.id);
    expect(ids).toEqual(["ortho", "hillshade", "lidar_hillshade", "boundary", "thermal", "contours"]);
  });

  it("thermal is a disabled stub again (real georeferenced-fix story: no radiometric sensor exists, so a fake same-extent thermal raster was replaced with CBA's original disabled-stub shape rather than kept as a mismatched-location file)", () => {
    const thermal = manifestJson.layers.find((l) => l.id === "thermal") as LayerDef;
    expect(thermal).toEqual({
      id: "thermal",
      type: "raster",
      url: null,
      opacity: 1,
      toggle: false,
      disabled: true,
      legend: "ironbow — stub until a radiometric sensor is acquired",
    });
  });

  it("contours is a geojson layer with a lineOnly style, off by default, now real DSM-derived data", () => {
    const contours = manifestJson.layers.find((l) => l.id === "contours") as LayerDef;
    expect(contours).toEqual({
      id: "contours",
      type: "geojson",
      url: "contours.geojson",
      opacity: 1,
      toggle: false,
      legend: "real 2.5m elevation contours derived from the ODM-reconstructed DSM",
      style: {
        lineColor: "#38bdf8",
        lineOnly: true,
      },
    });
  });

  it.each(["ortho", "hillshade", "boundary", "contours"])("%s layer has a non-null url", (id) => {
    const layer = manifestJson.layers.find((l) => l.id === id) as LayerDef;
    expect(typeof layer.url).toBe("string");
  });

  it("every raster/geojson url resolves to a real file under public/", () => {
    for (const layer of manifestJson.layers) {
      if (layer.url === null) continue;
      // url is a bare filename, relative to this manifest's own directory —
      // see components/LayerViewer/LayerViewer.tsx's resolveManifest() for
      // why (root-absolute paths break under any basePath/mount prefix).
      expect(layer.url.startsWith("/"), `${layer.id}: url should be a relative filename, not root-absolute`).toBe(
        false,
      );
      const filePath = path.join(sampleDir, layer.url);
      expect(existsSync(filePath), `${layer.id}: ${filePath} should exist`).toBe(true);
    }
  });

  it("ortho.tif and hillshade.tif have valid little-endian TIFF magic bytes", () => {
    for (const file of ["ortho.tif", "hillshade.tif"]) {
      const buf = readFileSync(path.join(sampleDir, file));
      // Bytes 49 49 2A 00 ("II*\0") - little-endian classic TIFF magic.
      // All three files were produced/verified as little-endian TIFFs.
      expect(buf.subarray(0, 4).toString("hex")).toBe("49492a00");
    }
  });

  it("ortho.tif and hillshade.tif pass strict COG validation (rio-cogeo), if python3+rio-cogeo is available", () => {
    for (const file of ["ortho.tif", "hillshade.tif"]) {
      const script = `
from rio_cogeo.cogeo import cog_validate
ok, errors, warnings = cog_validate("${path.join(sampleDir, file)}")
import sys
sys.exit(0 if ok else 1)
`;
      try {
        execFileSync("python3", ["-c", script], { stdio: "pipe" });
      } catch (err: unknown) {
        const e = err as { code?: string; status?: number };
        if (e.code === "ENOENT") {
          // python3 not on PATH in this environment - skip rather than fail.
          return;
        }
        throw new Error(`${file} failed rio-cogeo strict COG validation`);
      }
    }
  });

  it("parcel.geojson is a valid GeoJSON FeatureCollection with a Polygon geometry, sourced from the real Travis County parcel record (not a reconstruction approximation)", () => {
    const geojson = JSON.parse(readFileSync(path.join(sampleDir, "parcel.geojson"), "utf-8"));
    expect(geojson.type).toBe("FeatureCollection");
    expect(Array.isArray(geojson.features)).toBe(true);
    expect(geojson.features).toHaveLength(1);
    const [feature] = geojson.features;
    expect(feature.type).toBe("Feature");
    expect(feature.geometry.type).toBe("Polygon");
    expect(feature.geometry.coordinates[0].length).toBeGreaterThanOrEqual(4);
    // First/last ring point must match (closed ring) - a basic Polygon-validity check.
    const ring = feature.geometry.coordinates[0];
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    // Real recorded boundary now (Travis County Appraisal District), not the
    // old approximate-reconstruction-footprint placeholder -- see this
    // property's own commit for how it was fetched/verified (owner-of-record
    // match against the real address).
    expect(feature.properties.placeholder).toBeUndefined();
    expect(feature.properties.source).toMatch(/Travis County/i);
  });

  it("contours.geojson is a valid GeoJSON FeatureCollection of LineString contours, derived from the real DSM (not a placeholder)", () => {
    const geojson = JSON.parse(readFileSync(path.join(sampleDir, "contours.geojson"), "utf-8"));
    expect(geojson.type).toBe("FeatureCollection");
    expect(Array.isArray(geojson.features)).toBe(true);
    // Real elevation-derived contour geometry at multiple levels, not a
    // single decorative line.
    expect(geojson.features.length).toBeGreaterThan(1);
    for (const feature of geojson.features) {
      expect(feature.type).toBe("Feature");
      expect(["LineString", "MultiLineString"]).toContain(feature.geometry.type);
      expect(feature.geometry.coordinates.length).toBeGreaterThanOrEqual(2);
      expect(feature.properties.placeholder).toBeUndefined();
      expect(typeof feature.properties.elevationMeters).toBe("number");
    }
  });

  it(
    "ortho.tif and hillshade.tif share the SAME real-world extent " +
      "(both derived from the same real ODM reconstruction — one internally-consistent " +
      "dataset, not mismatched-scale files), if python3+rasterio is available",
    () => {
      const script = `
import json
import rasterio
bounds = {}
for f in ["ortho.tif", "hillshade.tif"]:
    with rasterio.open(f) as src:
        bounds[f] = list(src.bounds)
print(json.dumps(bounds))
`;
      let stdout: string;
      try {
        stdout = execFileSync("python3", ["-c", script], { cwd: sampleDir, stdio: ["ignore", "pipe", "ignore"] }).toString();
      } catch (err: unknown) {
        const e = err as { code?: string };
        if (e.code === "ENOENT") return; // python3 not on PATH - skip rather than fail.
        throw err;
      }
      const bounds = JSON.parse(stdout) as Record<string, number[]>;
      const [ortho, hillshade] = [bounds["ortho.tif"], bounds["hillshade.tif"]];
      // 1m tolerance (not sub-millimeter): ortho.tif and hillshade.tif are
      // two INDEPENDENTLY reprojected real rasters (one from
      // odm_orthophoto.tif, one derived from dsm.tif) from the same real
      // ODM reconstruction — a few cm of difference between their computed
      // extents is expected rounding, not a bug. What this test guards
      // against is the actual historical failure mode (a wrong/degenerate
      // CRS placing one raster kilometers from the other), which 1m easily
      // still catches.
      for (let i = 0; i < 4; i++) {
        expect(
          Math.abs(hillshade[i] - ortho[i]),
          `hillshade.tif bounds[${i}] should be within 1m of ortho.tif`,
        ).toBeLessThan(1);
      }
    },
  );
});
