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
import { buildLayerMapConfig, isWrapperFullscreen, resolveManifest } from "./LayerViewer";

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
