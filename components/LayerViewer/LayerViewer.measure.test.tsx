// Full-render specs for <LayerViewer>'s measure tool (layerviewer-phase2-tools
// epic's MeasureTool story) — the click-to-measure UI/wiring itself, NOT
// the pure distance/formatting/GeoJSON math (measureDistanceMeters/
// formatMeasureDistance/buildMeasureFeatureCollection — see
// LayerViewer.test.tsx for those). Deliberately a SEPARATE file from
// LayerViewer.test.tsx, same precedent as LayerViewer.models.test.tsx: real
// map-mounting behavior needs `maplibre-gl` mocked (rendering <LayerViewer>
// for real throws under jsdom — see LayerViewer.test.tsx's header comment),
// which makes it a real RTL render()/act() suite, not a plain unit-test file.
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GeoAnchoredModel } from "@/lib/geo-model-types";
import type { PropertyLayers } from "@/lib/layer-types";

type Listener = (...args: unknown[]) => void;

interface FakeSource {
  setData: ReturnType<typeof vi.fn>;
}

interface FakeMapInstance {
  layerIds: Set<string>;
  addLayerCalls: unknown[];
  sources: Record<string, FakeSource>;
  removed: boolean;
  on(event: string, cb: Listener): void;
  fire(event: string, payload?: unknown): void;
  fireLoad(): void;
  getSource(id: string): FakeSource | undefined;
}

const mocks = vi.hoisted(() => ({
  mapInstances: [] as FakeMapInstance[],
}));

vi.mock("maplibre-gl", () => {
  class FakeMap implements FakeMapInstance {
    listeners: Record<string, Listener[]> = {};
    layerIds = new Set<string>();
    addLayerCalls: unknown[] = [];
    sources: Record<string, FakeSource> = {};
    removed = false;

    constructor(_options: unknown) {
      mocks.mapInstances.push(this);
    }
    on(event: string, cb: Listener) {
      (this.listeners[event] ??= []).push(cb);
    }
    fire(event: string, payload?: unknown) {
      for (const cb of this.listeners[event] ?? []) cb(payload);
    }
    fireLoad() {
      this.fire("load");
    }
    addSource(id: string) {
      this.sources[id] = { setData: vi.fn() };
    }
    getSource(id: string) {
      return this.sources[id];
    }
    addLayer(layer: { id: string; type: string } | string) {
      const id = typeof layer === "string" ? layer : layer.id;
      this.layerIds.add(id);
      this.addLayerCalls.push(layer);
    }
    removeLayer(id: string) {
      this.layerIds.delete(id);
    }
    getLayer(id: string) {
      return this.layerIds.has(id) ? { id } : undefined;
    }
    setLayoutProperty() {}
    setPaintProperty() {}
    fitBounds() {}
    // Deterministic, order-preserving stand-in for MapLibre's real
    // lng/lat -> screen-pixel projection — the measure label's positioning
    // logic only needs SOME numeric {x,y} back, not real Web Mercator math
    // (that's MapLibre's own, already-tested code, not this story's).
    project([lng, lat]: [number, number]) {
      return { x: lng * 10, y: lat * 10 };
    }
    remove() {
      this.removed = true;
    }
  }

  return { Map: FakeMap, addProtocol: vi.fn() };
});

vi.mock("@geomatico/maplibre-cog-protocol", () => ({ cogProtocol: {} }));

// This suite's FakeMap above doesn't implement getContainer()/dragRotate/
// dragPan/etc. — the real terra-draw-maplibre-gl-adapter's constructor
// needs those (see LayerViewer.annotate.test.tsx's header comment for why
// the annotation tool's OWN suite mocks terra-draw the same way). The
// annotation tool isn't this file's concern at all, so both packages are
// mocked to bare no-ops here purely so the map's 'load' handler (which now
// also constructs a TerraDraw instance — see LayerViewer.tsx's "Annotation
// tool" block) doesn't throw against this file's simpler FakeMap.
vi.mock("terra-draw", () => {
  class FakeTerraDraw {
    start() {}
    stop() {}
    setMode() {}
    on() {}
    off() {}
    getSnapshot() {
      return [];
    }
    removeFeatures() {}
  }
  class FakeMode {}
  return {
    TerraDraw: FakeTerraDraw,
    TerraDrawPointMode: FakeMode,
    TerraDrawLineStringMode: FakeMode,
    TerraDrawPolygonMode: FakeMode,
    TerraDrawFreehandMode: FakeMode,
    TerraDrawRenderMode: FakeMode,
  };
});
vi.mock("terra-draw-maplibre-gl-adapter", () => ({
  TerraDrawMapLibreGLAdapter: class {},
}));

// Mocked out for the same reason LayerViewer.models.test.tsx mocks it —
// createModelLayer's real implementation touches three.js/WebGL, which
// isn't this story's concern (the `models` prop isn't exercised here at
// all) and isn't safe to pull into a jsdom test unmocked.
vi.mock("@/lib/maplibre-model-layer", () => ({
  createModelLayer: vi.fn((model: GeoAnchoredModel) => ({
    id: model.id,
    type: "custom" as const,
    onAdd: vi.fn(),
    render: vi.fn(),
    onRemove: vi.fn(),
  })),
}));

// Imported AFTER the vi.mock calls above (hoisted by Vitest regardless of
// source order, but written this way to read top-to-bottom the way it
// actually executes) — same ordering precedent as LayerViewer.models.test.tsx.
import { LayerViewer, formatMeasureDistance, measureDistanceMeters } from "./LayerViewer";

// Empty `layers` — these specs are entirely about the measure tool, not the
// pre-existing LayerDef rendering path (already covered by
// LayerViewer.test.tsx / LayerViewer.models.test.tsx).
const manifest: PropertyLayers = { slug: "test-property", title: "Test Property", layers: [] };

/** Drains the manifest-resolution effect's promise chain AND
 *  loadMapLibreModules()'s own Promise.all/.then chain — same helper (and
 *  same rationale) as LayerViewer.models.test.tsx's flushMapInit(). */
async function flushMapInit() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** The one GeoJSON source this suite's manifest (empty `layers`) ever
 *  causes <LayerViewer> to add — the measure tool's own. Looked up by
 *  value (there's exactly one) rather than by a hardcoded id string, since
 *  MEASURE_SOURCE_ID is an internal, non-exported constant. */
function getMeasureSource(map: FakeMapInstance): FakeSource {
  const sources = Object.values(map.sources);
  expect(sources).toHaveLength(1);
  return sources[0];
}

function fireMapClick(map: FakeMapInstance, lng: number, lat: number) {
  act(() => {
    map.fire("click", { lngLat: { lng, lat } });
  });
}

async function setupLoadedMap() {
  render(<LayerViewer manifest={manifest} />);
  await flushMapInit();
  const map = mocks.mapInstances[0];
  act(() => map.fireLoad());
  return map;
}

describe("<LayerViewer> measure tool", () => {
  beforeEach(() => {
    mocks.mapInstances.length = 0;
  });

  it("adds the measure GeoJSON source + a line and a circle layer once the map loads", async () => {
    const map = await setupLoadedMap();
    const lineLayer = map.addLayerCalls.find((l) => (l as { type: string }).type === "line");
    const circleLayer = map.addLayerCalls.find((l) => (l as { type: string }).type === "circle");
    expect(lineLayer).toBeDefined();
    expect(circleLayer).toBeDefined();
  });

  it("clicking the map while Measure mode is OFF places no point (map's normal behavior is unaffected)", async () => {
    const map = await setupLoadedMap();
    const source = getMeasureSource(map);
    source.setData.mockClear();

    fireMapClick(map, -122.4, 37.0);

    expect(source.setData).not.toHaveBeenCalled();
    expect(screen.queryByText(/Click two points to measure/)).not.toBeInTheDocument();
  });

  it("toggling Measure on shows the active legend; clicking twice draws the line and shows the real-world distance label", async () => {
    const map = await setupLoadedMap();
    const source = getMeasureSource(map);

    fireEvent.click(screen.getByRole("button", { name: /^Measure$/ }));
    expect(screen.getByText("Click two points to measure")).toBeInTheDocument();

    const a = { lng: -122.4, lat: 37.0 };
    const b = { lng: -122.41, lat: 37.02 };
    fireMapClick(map, a.lng, a.lat);
    fireMapClick(map, b.lng, b.lat);

    // The source was synced with both points + the connecting line.
    const lastCall = source.setData.mock.calls.at(-1)?.[0];
    expect(lastCall.features).toHaveLength(3);
    expect(lastCall.features[2].geometry.type).toBe("LineString");

    // The floating label shows the REAL great-circle distance (turf), not
    // a placeholder/pixel value — same numeric source of truth the pure
    // measureDistanceMeters/formatMeasureDistance unit tests verify
    // independently in LayerViewer.test.tsx.
    const expectedLabel = formatMeasureDistance(measureDistanceMeters(a, b));
    expect(screen.getByText(expectedLabel)).toBeInTheDocument();
  });

  it("a third click clears the old measurement and starts fresh at the new point", async () => {
    const map = await setupLoadedMap();
    const source = getMeasureSource(map);

    fireEvent.click(screen.getByRole("button", { name: /^Measure$/ }));
    fireMapClick(map, -122.4, 37.0);
    fireMapClick(map, -122.41, 37.02);
    expect(source.setData.mock.calls.at(-1)?.[0].features).toHaveLength(3);

    const third = { lng: -122.5, lat: 37.1 };
    fireMapClick(map, third.lng, third.lat);

    const afterThird = source.setData.mock.calls.at(-1)?.[0];
    expect(afterThird.features).toHaveLength(1);
    expect(afterThird.features[0]).toEqual({
      type: "Feature",
      geometry: { type: "Point", coordinates: [third.lng, third.lat] },
      properties: {},
    });
    // Only one point placed again — no distance label until a second click.
    expect(screen.queryByText(/ m$| km$/)).not.toBeInTheDocument();
  });

  it("Clear measurement is disabled with zero points, and clears state when clicked with a measurement placed", async () => {
    const map = await setupLoadedMap();
    const source = getMeasureSource(map);

    fireEvent.click(screen.getByRole("button", { name: /^Measure$/ }));
    const clearButton = screen.getByRole("button", { name: "Clear measurement" });
    expect(clearButton).toBeDisabled();

    fireMapClick(map, -122.4, 37.0);
    fireMapClick(map, -122.41, 37.02);
    expect(clearButton).not.toBeDisabled();

    fireEvent.click(clearButton);

    expect(source.setData.mock.calls.at(-1)?.[0]).toEqual({ type: "FeatureCollection", features: [] });
    expect(clearButton).toBeDisabled();
    expect(screen.queryByText(/ m$| km$/)).not.toBeInTheDocument();
  });
});
