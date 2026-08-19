// Unit specs for <LayerViewer>'s pure logic — NOT full-component render
// tests. Confirmed while scoping this suite: rendering <LayerViewer> at all
// under jsdom throws an unhandled `ReferenceError: Worker is not defined`
// (maplibre-gl / @geomatico/maplibre-cog-protocol touch the `Worker` global
// as a *module-load-time* side effect the moment the lazy `import(
// "maplibre-gl")` in LayerViewer.tsx's loadMapLibreModules() resolves —
// jsdom doesn't implement Worker). That's the exact reason
// buildLayerMapConfig() and resolveManifest() were pulled out of
// LayerViewer.tsx as plain functions with zero MapLibre API calls and no
// component render involved: they're the only pieces of this component
// that CAN be exercised by a jsdom-based unit test. Real map-mounting
// behavior (addLayerToMap/updateLayerOnMap actually calling
// map.addSource/addLayer/setPaintProperty, the 'load' handler's
// `if (layer.disabled) continue` skip, fitBounds) stays covered by the
// core-components story's live Playwright pass only — see this story's
// final report for the full breakdown.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LayerDef, PropertyLayers } from "@/lib/layer-types";
import {
  buildLayerMapConfig,
  buildMeasureFeatureCollection,
  formatMeasureDistance,
  isWrapperFullscreen,
  measureDistanceMeters,
  resolveManifest,
} from "./LayerViewer";

function makeLayer(overrides: Partial<LayerDef> & Pick<LayerDef, "id" | "type">): LayerDef {
  return {
    url: "https://example.test/data",
    opacity: 0.8,
    toggle: true,
    ...overrides,
  };
}

describe("buildLayerMapConfig", () => {
  it("raster + cog (default format) produces a cog:// source and one raster layer", () => {
    const layer = makeLayer({
      id: "ortho",
      type: "raster",
      url: "https://example.test/ortho.tif",
      opacity: 0.75,
      toggle: true,
    });

    expect(buildLayerMapConfig(layer)).toEqual({
      sourceId: "layer-ortho",
      source: { type: "raster", url: "cog://https://example.test/ortho.tif", tileSize: 256 },
      mapLayers: [
        {
          id: "layer-ortho-raster",
          type: "raster",
          source: "layer-ortho",
          layout: { visibility: "visible" },
          paint: { "raster-opacity": 0.75 },
        },
      ],
    });
  });

  it("raster + xyz produces a tiles[] source and one raster layer", () => {
    const layer = makeLayer({
      id: "hillshade",
      type: "raster",
      format: "xyz",
      url: "https://example.test/tiles/{z}/{x}/{y}.png",
      opacity: 0.5,
      toggle: false,
    });

    expect(buildLayerMapConfig(layer)).toEqual({
      sourceId: "layer-hillshade",
      source: { type: "raster", tiles: ["https://example.test/tiles/{z}/{x}/{y}.png"], tileSize: 256 },
      mapLayers: [
        {
          id: "layer-hillshade-raster",
          type: "raster",
          source: "layer-hillshade",
          layout: { visibility: "none" },
          paint: { "raster-opacity": 0.5 },
        },
      ],
    });
  });

  it("geojson produces a geojson source and a fill+line layer pair", () => {
    const layer = makeLayer({
      id: "boundary",
      type: "geojson",
      url: "https://example.test/boundary.geojson",
      opacity: 1,
      toggle: true,
    });

    expect(buildLayerMapConfig(layer)).toEqual({
      sourceId: "layer-boundary",
      source: { type: "geojson", data: "https://example.test/boundary.geojson" },
      mapLayers: [
        {
          id: "layer-boundary-fill",
          type: "fill",
          source: "layer-boundary",
          layout: { visibility: "visible" },
          paint: { "fill-color": "#22c55e", "fill-opacity": 0.25 },
        },
        {
          id: "layer-boundary-line",
          type: "line",
          source: "layer-boundary",
          layout: { visibility: "visible" },
          paint: { "line-color": "#22c55e", "line-width": 2, "line-opacity": 1 },
        },
      ],
    });
  });

  it("a disabled:true entry produces no source/layer config at all", () => {
    // The CBA's literal thermal-stub shape (lib/layer-types.ts's example):
    // url is required-null for disabled entries.
    const layer = makeLayer({
      id: "thermal",
      type: "raster",
      url: null,
      opacity: 1,
      toggle: false,
      disabled: true,
      legend: "ironbow",
    });

    expect(buildLayerMapConfig(layer)).toBeNull();
  });

  it("a live (non-disabled) entry with no url also produces no config — nothing to add", () => {
    const layer = makeLayer({ id: "broken", type: "raster", url: null });
    expect(buildLayerMapConfig(layer)).toBeNull();
  });
});

describe("isWrapperFullscreen", () => {
  // jsdom doesn't implement the Fullscreen API (no real
  // document.fullscreenElement/requestFullscreen), so this is exercised
  // against plain objects standing in for elements — the function itself
  // is a pure identity check, with no actual DOM/Fullscreen-API dependency.
  it("is true when the wrapper IS the fullscreen element", () => {
    const wrapper = {} as Element;
    expect(isWrapperFullscreen(wrapper, wrapper)).toBe(true);
  });

  it("is false when a different element is fullscreen", () => {
    const wrapper = {} as Element;
    const other = {} as Element;
    expect(isWrapperFullscreen(wrapper, other)).toBe(false);
  });

  it("is false when nothing is fullscreen", () => {
    const wrapper = {} as Element;
    expect(isWrapperFullscreen(wrapper, null)).toBe(false);
  });

  it("is false when the wrapper itself is null (not yet mounted)", () => {
    expect(isWrapperFullscreen(null, null)).toBe(false);
  });
});

describe("resolveManifest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const sample: PropertyLayers = {
    slug: "test-property",
    title: "Test Property",
    layers: [makeLayer({ id: "ortho", type: "raster" })],
  };

  it("resolves immediately given a PropertyLayers object, with no fetch involved", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(resolveManifest(sample)).resolves.toBe(sample);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fetches and parses JSON given a URL string", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => sample }),
    );

    await expect(resolveManifest("/properties/test-property/layers.json")).resolves.toEqual(sample);
    expect(fetch).toHaveBeenCalledWith("/properties/test-property/layers.json");
  });

  it("rejects with a status-coded message when the fetch response isn't ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }),
    );

    await expect(resolveManifest("/properties/missing/layers.json")).rejects.toThrow(/404/);
  });

  it("resolves relative layer urls against the manifest's own fetched URL (basePath-safe)", async () => {
    const relativeManifest: PropertyLayers = {
      slug: "test-property",
      title: "Test Property",
      layers: [makeLayer({ id: "ortho", type: "raster", url: "ortho.tif" })],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        url: "https://tools.mdostal.com/framework/layer-viewer-samples/2806-prado/layers.json",
        json: async () => relativeManifest,
      }),
    );

    const resolved = await resolveManifest("/framework/layer-viewer-samples/2806-prado/layers.json");
    expect(resolved.layers[0].url).toBe(
      "https://tools.mdostal.com/framework/layer-viewer-samples/2806-prado/ortho.tif",
    );
  });
});

// Measure tool specs (layerviewer-phase2-tools epic's MeasureTool story).
// measureDistanceMeters wraps @turf/turf's distance() — the whole point of
// this tool is REAL great-circle distance, not screen-pixel distance, so
// this is checked against a known real-world coordinate pair, not just "a
// number comes out".
describe("measureDistanceMeters", () => {
  it("computes ~1 nautical mile for two points 1 arcminute of latitude apart -- a known real-world distance (the nautical mile's own textbook definition)", () => {
    // The nautical mile is DEFINED as the length of one minute of arc of
    // latitude along a meridian: exactly 1852m under the modern
    // international definition. turf.distance() uses a haversine formula
    // over a mean *spherical* Earth radius (6371008.8m), not the WGS84
    // ellipsoid the international definition is actually pinned to, so the
    // two don't match to the millimeter -- but they agree to within ~0.1%,
    // which is exactly the tolerance a "did we wire up real geodesic math,
    // not screen pixels" check needs.
    const a = { lng: -122.4, lat: 37.0 };
    const b = { lng: -122.4, lat: 37.0 + 1 / 60 };
    const distance = measureDistanceMeters(a, b);
    expect(distance).toBeGreaterThan(1840);
    expect(distance).toBeLessThan(1865);
  });

  it("computes ~111.2km for two points exactly 1 degree of longitude apart at the equator -- another known real-world constant", () => {
    // 1 degree of longitude at the equator, over turf's mean Earth radius
    // (6371008.8m): radius * (pi/180) ≈ 111,195m. A second independent,
    // textbook-known real-world distance fact, at a totally different
    // scale than the nautical-mile check above.
    const a = { lng: 0, lat: 0 };
    const b = { lng: 1, lat: 0 };
    const distance = measureDistanceMeters(a, b);
    expect(distance).toBeGreaterThan(111000);
    expect(distance).toBeLessThan(111400);
  });

  it("returns 0 for two identical points", () => {
    const point = { lng: -122.4, lat: 37.0 };
    expect(measureDistanceMeters(point, point)).toBe(0);
  });

  it("is symmetric (order of points doesn't matter)", () => {
    const a = { lng: -122.4, lat: 37.0 };
    const b = { lng: -122.41, lat: 37.02 };
    expect(measureDistanceMeters(a, b)).toBeCloseTo(measureDistanceMeters(b, a));
  });
});

describe("formatMeasureDistance", () => {
  it("labels sub-1000m distances in meters, to 1 decimal place", () => {
    expect(formatMeasureDistance(42.567)).toBe("42.6 m");
  });

  it("labels exactly 1000m in kilometers (the >= boundary), to 2 decimal places", () => {
    expect(formatMeasureDistance(1000)).toBe("1.00 km");
  });

  it("labels distances over 1000m in kilometers, to 2 decimal places", () => {
    expect(formatMeasureDistance(1853.25)).toBe("1.85 km");
  });

  it("labels a zero distance in meters", () => {
    expect(formatMeasureDistance(0)).toBe("0.0 m");
  });
});

describe("buildMeasureFeatureCollection", () => {
  it("produces an empty FeatureCollection for zero points", () => {
    expect(buildMeasureFeatureCollection([])).toEqual({ type: "FeatureCollection", features: [] });
  });

  it("produces a single Point feature for one placed point -- no line yet", () => {
    const result = buildMeasureFeatureCollection([{ lng: -122.4, lat: 37.0 }]);
    expect(result.features).toHaveLength(1);
    expect(result.features[0]).toEqual({
      type: "Feature",
      geometry: { type: "Point", coordinates: [-122.4, 37.0] },
      properties: {},
    });
  });

  it("produces two Point features plus a connecting LineString for two placed points", () => {
    const a = { lng: -122.4, lat: 37.0 };
    const b = { lng: -122.41, lat: 37.02 };
    const result = buildMeasureFeatureCollection([a, b]);

    expect(result.features).toHaveLength(3);
    expect(result.features[0]).toEqual({
      type: "Feature",
      geometry: { type: "Point", coordinates: [a.lng, a.lat] },
      properties: {},
    });
    expect(result.features[1]).toEqual({
      type: "Feature",
      geometry: { type: "Point", coordinates: [b.lng, b.lat] },
      properties: {},
    });
    expect(result.features[2]).toEqual({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [a.lng, a.lat],
          [b.lng, b.lat],
        ],
      },
      properties: {},
    });
  });
});
