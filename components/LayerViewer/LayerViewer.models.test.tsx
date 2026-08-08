// Full-render specs for <LayerViewer>'s `models` prop (land-overlay epic's
// model-layer add/remove/cleanup glue — see LayerViewer.tsx's modelsRef /
// addedModelIdsRef / "Add/remove model layers" effect). This is
// deliberately a SEPARATE file from LayerViewer.test.tsx, not an addition
// to it — that file's header comment explains why it sticks to pure-logic
// specs only: rendering <LayerViewer> for real throws under jsdom, because
// "maplibre-gl"/"@geomatico/maplibre-cog-protocol" touch browser-only
// globals (Worker, WebGL) as a *module-load-time*/construction-time side
// effect. This file gets around that the same way
// lib/maplibre-model-layer.test.ts's "createModelLayer" describe block
// does: `vi.mock` both modules (plus "@/lib/maplibre-model-layer" itself,
// since createModelLayer's REAL implementation touches three.js/WebGL too
// — already covered by that file's own suite, not re-tested here) with
// lightweight fakes that record calls instead of touching a real GL
// context. That makes a real RTL render()/rerender()/unmount() meaningful
// here: it exercises the actual React effects wiring the `models` prop
// into `map.addLayer`/`map.removeLayer`, not just the shape of a plain
// function's return value.
import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GeoAnchoredModel } from "@/lib/geo-model-types";
import type { PropertyLayers } from "@/lib/layer-types";

type Listener = (...args: unknown[]) => void;

const mocks = vi.hoisted(() => ({
  mapInstances: [] as FakeMapInstance[],
  createModelLayer: vi.fn((model: GeoAnchoredModel) => ({
    id: model.id,
    type: "custom" as const,
    onAdd: vi.fn(),
    render: vi.fn(),
    onRemove: vi.fn(),
    setOpacity: vi.fn(),
    setVisible: vi.fn(),
  })),
}));

// Declared ambient-style so the `vi.hoisted` block above (which runs before
// this file's own imports/declarations, same hoisting caveat
// lib/maplibre-model-layer.test.ts's header comment calls out) can name the
// array's element type without a forward-reference error — the actual
// class is defined inside the vi.mock("maplibre-gl") factory below, this
// is just its shape for typing mocks.mapInstances.
interface FakeMapInstance {
  layerIds: Set<string>;
  removeLayerCalls: string[];
  removed: boolean;
  getLayer(id: string): { id: string } | undefined;
  on(event: string, cb: Listener): void;
  fireLoad(): void;
}

vi.mock("maplibre-gl", () => {
  class FakeMap implements FakeMapInstance {
    listeners: Record<string, Listener[]> = {};
    layerIds = new Set<string>();
    addLayerCalls: unknown[] = [];
    removeLayerCalls: string[] = [];
    removed = false;

    constructor(_options: unknown) {
      mocks.mapInstances.push(this);
    }
    on(event: string, cb: Listener) {
      (this.listeners[event] ??= []).push(cb);
    }
    fireLoad() {
      for (const cb of this.listeners.load ?? []) cb();
    }
    addSource() {}
    getSource() {
      return undefined;
    }
    addLayer(layer: { id: string } | string) {
      const id = typeof layer === "string" ? layer : layer.id;
      this.layerIds.add(id);
      this.addLayerCalls.push(layer);
    }
    removeLayer(id: string) {
      this.layerIds.delete(id);
      this.removeLayerCalls.push(id);
    }
    getLayer(id: string) {
      return this.layerIds.has(id) ? { id } : undefined;
    }
    setLayoutProperty() {}
    setPaintProperty() {}
    fitBounds() {}
    remove() {
      this.removed = true;
    }
  }

  return { Map: FakeMap, addProtocol: vi.fn() };
});

vi.mock("@geomatico/maplibre-cog-protocol", () => ({ cogProtocol: {} }));

// The real createModelLayer (lib/maplibre-model-layer.ts) is fully covered
// by its own suite (lib/maplibre-model-layer.test.ts) — mocked here so
// these specs test LayerViewer's WIRING (does it get called with the right
// model, does its return value reach map.addLayer/removeLayer) without
// re-exercising three.js/GLTFLoader control flow that isn't this story's
// concern.
vi.mock("@/lib/maplibre-model-layer", () => ({
  createModelLayer: mocks.createModelLayer,
}));

// Imported AFTER the vi.mock calls above (hoisted by Vitest regardless of
// source order, but written this way to read top-to-bottom the way it
// actually executes).
import { LayerViewer } from "./LayerViewer";

function makeModel(overrides: Partial<GeoAnchoredModel> = {}): GeoAnchoredModel {
  return { id: "duck", url: "/model3d-samples/duck/model.glb", title: "Duck", lat: 1, lon: 2, ...overrides };
}

// Empty `layers` — these specs are about the NEW `models` prop, not the
// pre-existing LayerDef rendering path (already covered by
// LayerViewer.test.tsx / the core-components Playwright suite).
const manifest: PropertyLayers = { slug: "test-property", title: "Test Property", layers: [] };

/** Drains the manifest-resolution effect's promise chain AND
 *  loadMapLibreModules()'s own Promise.all/.then chain, so `mocks.mapInstances[0]`
 *  (the fake Map created once the map-init effect actually runs) exists by
 *  the time a test needs it. Mirrors maplibre-model-layer.test.ts's own
 *  flushOnAdd() helper and its "a couple of microtask ticks isn't reliably
 *  enough" reasoning — a zero-delay macrotask tick guarantees every
 *  already-queued microtask (however many .then() hops deep) has run. */
async function flushMapInit() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("<LayerViewer> models prop", () => {
  beforeEach(() => {
    mocks.mapInstances.length = 0;
    mocks.createModelLayer.mockClear();
  });

  it("`models` omitted — fully backward compatible: no createModelLayer call at all once the map loads", async () => {
    render(<LayerViewer manifest={manifest} />);
    await flushMapInit();
    const map = mocks.mapInstances[0];

    act(() => map.fireLoad());

    expect(mocks.createModelLayer).not.toHaveBeenCalled();
  });

  it("given models={[geoAnchoredModel]}, when the map finishes loading, the model layer is added via map.addLayer(createModelLayer(model))", async () => {
    const model = makeModel();
    render(<LayerViewer manifest={manifest} models={[model]} />);
    await flushMapInit();
    const map = mocks.mapInstances[0];

    act(() => map.fireLoad());

    expect(mocks.createModelLayer).toHaveBeenCalledWith(model);
    expect(map.layerIds.has("duck")).toBe(true);
  });

  it("a models prop change removing an entry calls map.removeLayer for it", async () => {
    const model = makeModel();
    const { rerender } = render(<LayerViewer manifest={manifest} models={[model]} />);
    await flushMapInit();
    const map = mocks.mapInstances[0];
    act(() => map.fireLoad());
    expect(map.layerIds.has("duck")).toBe(true);

    act(() => {
      rerender(<LayerViewer manifest={manifest} models={[]} />);
    });

    expect(map.removeLayerCalls).toContain("duck");
    expect(map.layerIds.has("duck")).toBe(false);
  });

  it("a models prop change adding an entry only adds the new one — the already-added model is left untouched", async () => {
    const duck = makeModel({ id: "duck" });
    const { rerender } = render(<LayerViewer manifest={manifest} models={[duck]} />);
    await flushMapInit();
    const map = mocks.mapInstances[0];
    act(() => map.fireLoad());
    mocks.createModelLayer.mockClear();

    const barn = makeModel({ id: "barn", url: "/model3d-samples/barn/model.glb" });
    act(() => {
      rerender(<LayerViewer manifest={manifest} models={[duck, barn]} />);
    });

    expect(mocks.createModelLayer).toHaveBeenCalledTimes(1);
    expect(mocks.createModelLayer).toHaveBeenCalledWith(barn);
    expect(map.layerIds.has("duck")).toBe(true);
    expect(map.layerIds.has("barn")).toBe(true);
  });

  it("unmounting with an active model layer removes it as part of teardown, alongside map.remove()", async () => {
    const model = makeModel();
    const { unmount } = render(<LayerViewer manifest={manifest} models={[model]} />);
    await flushMapInit();
    const map = mocks.mapInstances[0];
    act(() => map.fireLoad());
    expect(map.layerIds.has("duck")).toBe(true);

    act(() => {
      unmount();
    });

    expect(map.removeLayerCalls).toContain("duck");
    expect(map.removed).toBe(true);
  });
});
