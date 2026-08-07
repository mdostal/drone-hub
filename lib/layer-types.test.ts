import { describe, expect, it } from "vitest";
import type { LayerDef, PropertyLayers } from "./layer-types";

// These are primarily type-level assertions: if the shapes drift from the
// pre-made decisions in the layer-viewer epic's design discussion, this
// file fails to *compile* (caught by `tsc`/`npm run build`), independent
// of the runtime assertions below.

describe("LayerDef", () => {
  it("type-checks a valid live raster layer", () => {
    const ortho: LayerDef = {
      id: "ortho",
      type: "raster",
      url: "https://example.com/ortho.tif",
      opacity: 1,
      toggle: true,
      format: "cog",
    };
    expect(ortho.type).toBe("raster");
    expect(ortho.url).toBe("https://example.com/ortho.tif");
  });

  it("type-checks a valid live geojson layer", () => {
    const boundary: LayerDef = {
      id: "boundary",
      type: "geojson",
      url: "https://example.com/boundary.geojson",
      opacity: 0.8,
      toggle: false,
    };
    expect(boundary.type).toBe("geojson");
  });

  it("type-checks a raster layer with format omitted (conceptual default: 'cog')", () => {
    const hillshade: LayerDef = {
      id: "hillshade",
      type: "raster",
      url: "https://example.com/hillshade.tif",
      opacity: 0.6,
      toggle: true,
    };
    expect(hillshade.format).toBeUndefined();
  });

  it("type-checks a disabled:true entry with url:null", () => {
    const disabledStub: LayerDef = {
      id: "lidar",
      type: "raster",
      url: null,
      opacity: 1,
      toggle: false,
      disabled: true,
    };
    expect(disabledStub.url).toBeNull();
    expect(disabledStub.disabled).toBe(true);
  });

  it("type-checks CBA's literal thermal-stub example exactly", () => {
    const thermalStub: LayerDef = {
      id: "thermal",
      type: "raster",
      url: null,
      opacity: 1,
      toggle: false,
      disabled: true,
      legend: "ironbow",
    };
    expect(thermalStub).toEqual({
      id: "thermal",
      type: "raster",
      url: null,
      opacity: 1,
      toggle: false,
      disabled: true,
      legend: "ironbow",
    });
  });

  it("type-checks xyz raster format", () => {
    const tiles: LayerDef = {
      id: "contours",
      type: "raster",
      url: "https://example.com/{z}/{x}/{y}.png",
      opacity: 1,
      toggle: true,
      format: "xyz",
    };
    expect(tiles.format).toBe("xyz");
  });
});

describe("PropertyLayers", () => {
  it("type-checks a valid manifest with no basemap field", () => {
    const manifest: PropertyLayers = {
      slug: "2806-prado",
      title: "2806 Prado",
      layers: [
        {
          id: "ortho",
          type: "raster",
          url: "https://example.com/ortho.tif",
          opacity: 1,
          toggle: true,
          format: "cog",
        },
        {
          id: "thermal",
          type: "raster",
          url: null,
          opacity: 1,
          toggle: false,
          disabled: true,
          legend: "ironbow",
        },
      ],
    };
    expect(manifest.slug).toBe("2806-prado");
    expect(manifest.layers).toHaveLength(2);
    expect("basemap" in manifest).toBe(false);
  });
});
