import { describe, expect, it } from "vitest";
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

describe("2806-prado sample heightmap", () => {
  it("runtime-validates and type-checks as a valid VoxelGrid", () => {
    const raw: unknown = heightmapJson;
    assertVoxelGrid(raw);
    const grid: VoxelGrid = raw; // narrowed by the assertion above, no cast needed
    expect(grid.slug).toBe("2806-prado");
    expect(grid.title).toMatch(/derived terrain/i);
  });

  it("has no color/material/rendering fields (data shape only)", () => {
    const keys = Object.keys(heightmapJson).sort();
    expect(keys).toEqual(["heights", "size", "slug", "title"]);
  });

  it("heights.length === size*size", () => {
    expect(heightmapJson.heights.length).toBe(heightmapJson.size * heightmapJson.size);
    expect(heightmapJson.size).toBe(48);
    expect(heightmapJson.heights.length).toBe(2304);
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

  // A previous version of this file cross-checked the heightmap against
  // public/layer-viewer-samples/2806-prado/hillshade.tif's own pixel
  // gradient (re-derived live via python3+rasterio), because at the time
  // heights were themselves quantized FROM hillshade pixel intensity — a
  // shading proxy for terrain, not real elevation.
  //
  // The real georeferenced-fix story replaced that lineage: this
  // heightmap.json is now block-pooled and quantized DIRECTLY from the
  // real DSM (dsm.tif, from the operator's actual ODM reconstruction of
  // 2806 Prado St), not from hillshade. That cross-check no longer applies
  // and would likely be actively misleading if kept — hillshade encodes
  // local slope+aspect shading relative to a sun angle, which has no
  // reliable monotonic relationship to absolute elevation (a flat rooftop
  // at high elevation and flat ground at low elevation can produce similar
  // hillshade values), so testing heights-vs-hillshade correlation would
  // be testing the wrong thing now. The DSM itself isn't duplicated into
  // this repo as a second copy for a test to re-derive from (it's a 2.8MB
  // raster and hillshade.tif already carries its derived, committable
  // form) — the statistical checks above (range, real variation, spatial
  // correlation) remain real, meaningful validation of the shipped data
  // independent of which raster it was pooled from.
  //
  // Re-generated again (32x32 -> 48x48, size assertion above updated to
  // match): still pooled directly from dsm.tif, same lineage as above, just
  // re-run with a tighter ~70x70m crop centered precisely on the parcel
  // centroid (30.2618978800391, -97.7081778061722 -- the same anchor
  // GeoAnchoredModel/ModelDef's upAxis fix uses) and 5th/95th-percentile
  // contrast normalization instead of raw min/max, so a handful of extreme
  // tree-canopy pixels don't compress the ground-vs-roof band separation.
  // Cross-checked live against the real orthophoto at the same crop window
  // before shipping: the resulting mid-band plateau lines up with the
  // actual roof's real position, not just "some plausible-looking bumps."
});
