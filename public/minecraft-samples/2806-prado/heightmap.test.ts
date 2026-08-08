import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { VoxelGrid } from "@/lib/voxel-types";
import heightmapJson from "./heightmap.json";

// Verification for the minecraft-types-and-heightmap story. Kept (not
// throwaway) so it re-runs under `npm run test` and catches drift if the
// sample data or lib/voxel-types.ts shape ever changes. Mirrors the
// runtime-type-guard + real-file style established by
// public/layer-viewer-samples/2806-prado/manifest.test.ts.
//
// `heightmapJson` is imported via tsconfig's resolveJsonModule; a plain
// `const x: VoxelGrid = heightmapJson` would compile but wouldn't actually
// prove the JSON's runtime shape matches VoxelGrid (a JSON import has no
// literal-type narrowing to check against), so `assertVoxelGrid` below is a
// runtime type-guard that both type-checks (its `asserts` signature is
// checked by `tsc`/`npm run build`) and validates the actual JSON content.

function assertVoxelGrid(x: unknown): asserts x is VoxelGrid {
  expect(x).toBeTypeOf("object");
  const g = x as Record<string, unknown>;
  expect(typeof g.slug).toBe("string");
  expect(typeof g.title).toBe("string");
  expect(typeof g.size).toBe("number");
  expect(Array.isArray(g.heights)).toBe(true);
  for (const [i, h] of (g.heights as unknown[]).entries()) {
    expect(typeof h, `heights[${i}]`).toBe("number");
    expect(Number.isInteger(h), `heights[${i}] should be an integer`).toBe(true);
  }
}

const sampleDir = path.dirname(new URL(import.meta.url).pathname);

describe("2806-prado sample heightmap", () => {
  it("runtime-validates and type-checks as a valid VoxelGrid", () => {
    const raw: unknown = heightmapJson;
    assertVoxelGrid(raw);
    const grid: VoxelGrid = raw; // narrowed by the assertion above, no cast needed
    expect(grid.slug).toBe("2806-prado");
    expect(grid.title).toMatch(/derived sample terrain/i);
  });

  it("has no color/material/rendering fields (data shape only)", () => {
    const keys = Object.keys(heightmapJson).sort();
    expect(keys).toEqual(["heights", "size", "slug", "title"]);
  });

  it("heights.length === size*size", () => {
    expect(heightmapJson.heights.length).toBe(heightmapJson.size * heightmapJson.size);
    expect(heightmapJson.size).toBe(32);
    expect(heightmapJson.heights.length).toBe(1024);
  });

  it("height values fall within the documented [1,8] band", () => {
    for (const h of heightmapJson.heights) {
      expect(h).toBeGreaterThanOrEqual(1);
      expect(h).toBeLessThanOrEqual(8);
    }
  });

  it("shows real variation: not all-identical, and a meaningful spread", () => {
    const heights = heightmapJson.heights;
    const unique = new Set(heights);
    // Not a flat plateau.
    expect(unique.size).toBeGreaterThan(1);
    // Not degenerate (e.g. only two values at the extremes) - the source
    // hillshade has real mid-range gradient, so a healthy derived grid
    // should show several distinct bands.
    expect(unique.size).toBeGreaterThanOrEqual(4);

    const mean = heights.reduce((a, b) => a + b, 0) / heights.length;
    const variance =
      heights.reduce((a, b) => a + (b - mean) ** 2, 0) / heights.length;
    const stddev = Math.sqrt(variance);
    // A meaningful spread, not noise clustered on a single value nor a
    // rounding artifact of near-zero variance.
    expect(stddev).toBeGreaterThan(0.5);
  });

  it("adjacent cells are spatially correlated (terrain-like, not random noise)", () => {
    // Random per-cell noise would show ~0 correlation between a grid and
    // itself shifted by one column; a real terrain gradient (like this
    // hillshade-derived grid) shows strong positive correlation, since
    // neighboring cells tend to share similar elevation.
    const { size, heights } = heightmapJson;
    const a: number[] = [];
    const b: number[] = [];
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size - 1; col++) {
        a.push(heights[row * size + col]);
        b.push(heights[row * size + col + 1]);
      }
    }
    const mean = (arr: number[]) => arr.reduce((x, y) => x + y, 0) / arr.length;
    const ma = mean(a);
    const mb = mean(b);
    let num = 0;
    let da = 0;
    let db = 0;
    for (let i = 0; i < a.length; i++) {
      num += (a[i] - ma) * (b[i] - mb);
      da += (a[i] - ma) ** 2;
      db += (b[i] - mb) ** 2;
    }
    const correlation = num / Math.sqrt(da * db);
    expect(correlation).toBeGreaterThan(0.5);
  });

  it(
    "is correlated with the actual source hillshade pixel gradient " +
      "(re-derived independently via python3+rasterio), if available",
    () => {
      const hillshadePath = path.join(
        process.cwd(),
        "public/layer-viewer-samples/2806-prado/hillshade.tif",
      );
      const script = `
import json
import numpy as np
import rasterio

with rasterio.open("${hillshadePath}") as src:
    arr = src.read(1).astype(np.float64)

size = ${heightmapJson.size}
# Separate row/column block sizes, NOT a single shared block derived from
# rows alone — layerviewer-sample-dataset-overhaul's hillshade.tif is a
# real (non-square) portrait aspect (rows > cols, matching the new sample
# ortho's own natural extent), so a single arr.shape[0]-based block would
# under-cover the narrower column dimension and make the reshape below
# fail outright. This mirrors the actual generation script's own
# block_h/block_w split.
block_h = arr.shape[0] // size
block_w = arr.shape[1] // size
trimmed = arr[: size * block_h, : size * block_w]
pooled = trimmed.reshape(size, block_h, size, block_w).mean(axis=(1, 3))
print(json.dumps(pooled.flatten().tolist()))
`;
      let stdout: string;
      try {
        stdout = execFileSync("python3", ["-c", script], {
          stdio: ["ignore", "pipe", "ignore"],
        }).toString();
      } catch (err: unknown) {
        const e = err as { code?: string };
        if (e.code === "ENOENT") {
          // python3 not on PATH in this environment - skip rather than fail,
          // matching manifest.test.ts's rio-cogeo skip pattern.
          return;
        }
        throw new Error("failed to re-derive pooled hillshade values via python3+rasterio");
      }
      const pooled: number[] = JSON.parse(stdout);
      const heights = heightmapJson.heights;
      expect(pooled.length).toBe(heights.length);

      const mean = (arr: number[]) => arr.reduce((x, y) => x + y, 0) / arr.length;
      const mp = mean(pooled);
      const mh = mean(heights);
      let num = 0;
      let dp = 0;
      let dh = 0;
      for (let i = 0; i < pooled.length; i++) {
        num += (pooled[i] - mp) * (heights[i] - mh);
        dp += (pooled[i] - mp) ** 2;
        dh += (heights[i] - mh) ** 2;
      }
      const correlation = num / Math.sqrt(dp * dh);
      // Quantization is a monotonic (rounded-linear) map of the pooled
      // pixel average, so it should correlate very strongly with the raw
      // pooled hillshade values it was derived from.
      expect(correlation).toBeGreaterThan(0.95);
    },
  );
});
