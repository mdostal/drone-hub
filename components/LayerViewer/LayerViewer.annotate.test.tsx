// Full-render specs for <LayerViewer>'s annotation tool (layerviewer-phase2-tools
// epic's AnnotationLayer story) — the mode-switcher toolbar + placed-
// annotation legend panel + onAnnotationsChange wiring. Deliberately a
// SEPARATE file from LayerViewer.test.tsx/LayerViewer.measure.test.tsx/
// LayerViewer.models.test.tsx, same precedent as those files: a real RTL
// render() of <LayerViewer> needs "maplibre-gl" mocked (see
// LayerViewer.test.tsx's header comment for why rendering it for real
// throws under jsdom).
//
// terra-draw itself is ALSO mocked here, deliberately — not because
// "maplibre-gl" is the only browser-API-dependent piece, but because
// terra-draw's real behavior (translating actual pointer/mouse DOM events
// into placed vertices/shapes, snapping, drag math, ...) is real,
// already-tested browser-layout-dependent logic that isn't this story's
// concern, exactly the same "mock the library's public API surface with a
// small deterministic fake that honors the same contract" approach
// Gallery.test.tsx uses for embla-carousel-react (see that file's header
// comment). This suite verifies <LayerViewer>'s OWN wiring — does clicking
// a toolbar button call draw.setMode() with the right mode name, does a
// terra-draw "change" event update the legend panel + fire
// onAnnotationsChange, does a legend row's Delete button call
// draw.removeFeatures() — not terra-draw's own drawing-interaction
// internals (out of scope, and untestable under jsdom regardless).
import type { ComponentProps } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GeoAnchoredModel } from "@/lib/geo-model-types";
import type { PropertyLayers } from "@/lib/layer-types";

type Listener = (...args: unknown[]) => void;
type ChangeListener = () => void;

interface FakeMapInstance {
  listeners: Record<string, Listener[]>;
  on(event: string, cb: Listener): void;
  fire(event: string, payload?: unknown): void;
  fireLoad(): void;
}

/** The fake TerraDraw instance's test-only surface, in addition to the
 *  real public methods this component actually calls
 *  (start/stop/setMode/on/getSnapshot/removeFeatures). `addFeatureForTest`
 *  is NOT part of terra-draw's real API — it stands in for "a user finished
 *  drawing a shape", which this suite deliberately doesn't try to
 *  reproduce via real pointer events (see this file's header comment). */
interface FakeTerraDrawInstance {
  started: boolean;
  stopped: boolean;
  setModeCalls: string[];
  removeFeaturesCalls: unknown[][];
  features: GeoJSON.Feature[];
  addFeatureForTest(feature: GeoJSON.Feature): void;
}

const mocks = vi.hoisted(() => ({
  mapInstances: [] as FakeMapInstance[],
  drawInstances: [] as FakeTerraDrawInstance[],
}));

vi.mock("maplibre-gl", () => {
  class FakeMap implements FakeMapInstance {
    listeners: Record<string, Listener[]> = {};
    sources: Record<string, { setData: ReturnType<typeof vi.fn> }> = {};
    layerIds = new Set<string>();

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
    addLayer(layer: { id: string } | string) {
      const id = typeof layer === "string" ? layer : layer.id;
      this.layerIds.add(id);
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
    project([lng, lat]: [number, number]) {
      return { x: lng * 10, y: lat * 10 };
    }
    remove() {}
  }

  return { Map: FakeMap, addProtocol: vi.fn() };
});

vi.mock("@geomatico/maplibre-cog-protocol", () => ({ cogProtocol: {} }));

vi.mock("@/lib/maplibre-model-layer", () => ({
  createModelLayer: vi.fn((model: GeoAnchoredModel) => ({
    id: model.id,
    type: "custom" as const,
    onAdd: vi.fn(),
    render: vi.fn(),
    onRemove: vi.fn(),
  })),
}));

vi.mock("terra-draw", () => {
  class FakeTerraDraw implements FakeTerraDrawInstance {
    started = false;
    stopped = false;
    mode = "render";
    setModeCalls: string[] = [];
    removeFeaturesCalls: unknown[][] = [];
    features: GeoJSON.Feature[] = [];
    private changeListeners: ChangeListener[] = [];

    constructor(_options: unknown) {
      mocks.drawInstances.push(this);
    }
    start() {
      this.started = true;
    }
    stop() {
      this.stopped = true;
    }
    setMode(mode: string) {
      this.mode = mode;
      this.setModeCalls.push(mode);
    }
    on(event: string, cb: ChangeListener) {
      if (event === "change") this.changeListeners.push(cb);
    }
    off() {}
    getSnapshot() {
      return this.features;
    }
    removeFeatures(ids: unknown[]) {
      this.removeFeaturesCalls.push(ids);
      this.features = this.features.filter((f) => !ids.includes(f.id));
      this.emitChange();
    }
    /** Test-only helper — see FakeTerraDrawInstance's doc comment above. */
    addFeatureForTest(feature: GeoJSON.Feature) {
      this.features.push(feature);
      this.emitChange();
    }
    private emitChange() {
      for (const cb of this.changeListeners) cb();
    }
  }

  class FakeMode {
    constructor(public options?: unknown) {}
  }

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
  TerraDrawMapLibreGLAdapter: class {
    constructor(public options: unknown) {}
  },
}));

// Imported AFTER the vi.mock calls above (hoisted by Vitest regardless of
// source order, but written this way to read top-to-bottom the way it
// actually executes) — same ordering precedent as LayerViewer.measure.test.tsx.
import { LayerViewer } from "./LayerViewer";

const manifest: PropertyLayers = { slug: "test-property", title: "Test Property", layers: [] };

/** Drains the manifest-resolution effect's promise chain AND
 *  loadMapLibreModules()'s own Promise.all/.then chain — same helper (and
 *  same rationale) as LayerViewer.measure.test.tsx's flushMapInit(). */
async function flushMapInit() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function setupLoadedMap(props: Partial<ComponentProps<typeof LayerViewer>> = {}) {
  const view = render(<LayerViewer manifest={manifest} {...props} />);
  await flushMapInit();
  const map = mocks.mapInstances[0];
  act(() => map.fireLoad());
  const draw = mocks.drawInstances[0];
  return { map, draw, unmount: view.unmount };
}

describe("<LayerViewer> annotation tool", () => {
  beforeEach(() => {
    mocks.mapInstances.length = 0;
    mocks.drawInstances.length = 0;
  });

  it("constructs TerraDraw once the map loads, starts it, and leaves it in the idle render mode", async () => {
    const { draw } = await setupLoadedMap();
    expect(draw.started).toBe(true);
    expect(draw.setModeCalls).toEqual(["render"]);
  });

  it("shows the four drawing-mode buttons and a 'No annotations yet' placeholder before anything is placed", async () => {
    await setupLoadedMap();
    for (const label of ["Point", "Line", "Polygon", "Freehand"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByText("No annotations yet")).toBeInTheDocument();
  });

  it("clicking a mode button switches terra-draw's active mode and marks the button pressed", async () => {
    const { draw } = await setupLoadedMap();
    const pointButton = screen.getByRole("button", { name: "Point" });

    fireEvent.click(pointButton);

    expect(draw.setModeCalls.at(-1)).toBe("point");
    expect(pointButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Click the map to draw")).toBeInTheDocument();
  });

  it("clicking the already-active mode button again returns terra-draw to the idle render mode", async () => {
    const { draw } = await setupLoadedMap();
    const pointButton = screen.getByRole("button", { name: "Point" });

    fireEvent.click(pointButton);
    fireEvent.click(pointButton);

    expect(draw.setModeCalls.at(-1)).toBe("render");
    expect(pointButton).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByText("Click the map to draw")).not.toBeInTheDocument();
  });

  it("clicking a different mode button switches directly, without needing to toggle the old one off first", async () => {
    const { draw } = await setupLoadedMap();
    fireEvent.click(screen.getByRole("button", { name: "Point" }));
    fireEvent.click(screen.getByRole("button", { name: "Polygon" }));

    expect(draw.setModeCalls).toEqual(["render", "point", "polygon"]);
    expect(screen.getByRole("button", { name: "Point" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Polygon" })).toHaveAttribute("aria-pressed", "true");
  });

  it("a terra-draw 'change' event (a feature placed) updates the legend panel and fires onAnnotationsChange", async () => {
    const onAnnotationsChange = vi.fn();
    const { draw } = await setupLoadedMap({ onAnnotationsChange });

    const placed: GeoJSON.Feature = {
      id: "feature-1",
      type: "Feature",
      geometry: { type: "Point", coordinates: [-122.4, 37.0] },
      properties: {},
    };
    act(() => draw.addFeatureForTest(placed));

    expect(screen.getByRole("list", { name: "Placed annotations" })).toHaveTextContent("Point");
    expect(screen.queryByText("No annotations yet")).not.toBeInTheDocument();
    expect(onAnnotationsChange).toHaveBeenLastCalledWith([placed]);
  });

  it("clicking a legend row's Delete button calls terra-draw's removeFeatures with that feature's id", async () => {
    const onAnnotationsChange = vi.fn();
    const { draw } = await setupLoadedMap({ onAnnotationsChange });

    const placed: GeoJSON.Feature = {
      id: "feature-2",
      type: "Feature",
      geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] },
      properties: {},
    };
    act(() => draw.addFeatureForTest(placed));

    fireEvent.click(screen.getByRole("button", { name: "Delete LineString annotation" }));

    expect(draw.removeFeaturesCalls).toEqual([["feature-2"]]);
    expect(screen.getByText("No annotations yet")).toBeInTheDocument();
    expect(onAnnotationsChange).toHaveBeenLastCalledWith([]);
  });

  it("unmounting stops the terra-draw instance", async () => {
    const { draw, unmount } = await setupLoadedMap();
    expect(draw.stopped).toBe(false);
    unmount();
    expect(draw.stopped).toBe(true);
  });
});
