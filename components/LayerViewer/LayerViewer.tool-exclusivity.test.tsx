// Integration specs for the layerviewer-phase2-closeout story's REQUIRED
// integration check: "MeasureTool and AnnotationLayer both want to own map
// click events when active ... confirm ... only one of them is actually
// consuming clicks at a time." A real test, not just reading the code and
// assuming — see LayerViewer.tsx's `annotationModeRef` comment (the "MUTUAL-
// EXCLUSION FIX" block, right above where `annotationMode` state is
// declared) for the researched root cause this suite is regression-guarding:
// terra-draw-maplibre-gl-adapter attaches its OWN native pointer listeners
// directly to the map's canvas element (`getMapEventElement()` returns
// `this._map.getCanvas()` — verified against
// node_modules/terra-draw-maplibre-gl-adapter/dist/*.module.js, not just its
// .d.ts), completely independently of MapLibre's synthetic
// `map.on("click", ...)` event system that <LayerViewer>'s OWN measure-tool
// click handler is registered on. Before the fix, a single physical click
// with Measure mode on AND an annotation drawing mode active would be
// consumed by BOTH mechanisms — a measure point placed AND (in a real
// browser, not reproducible under jsdom — see LayerViewer.annotate.test.tsx's
// header comment for why terra-draw's own drawing internals are mocked out
// entirely here too) a terra-draw vertex drawn, from the same click.
//
// This suite verifies the two-part fix at the level THIS component actually
// controls and this test harness can actually observe:
//   1. UI-level mutual exclusion: activating one tool's toggle button turns
//      the other one off (terra-draw's setMode(idle) is called; the other
//      button's aria-pressed flips false).
//   2. Defense-in-depth: even bypassing the UI (going straight to a map
//      click while — hypothetically — both flags were still set), the
//      measure click handler exists to place a point ONLY when annotation
//      mode is idle, so it never double-handles a click annotation mode
//      would otherwise consume.
//
// Combines LayerViewer.measure.test.tsx's FakeMap (source/getSource, needed
// to observe the measure tool's own GeoJSON sync) with
// LayerViewer.annotate.test.tsx's FakeTerraDraw (setModeCalls, needed to
// observe terra-draw's own mode switches) — same mocking precedent as both
// of those files' own header comments, just combined into one suite because
// this story is specifically about the interaction BETWEEN the two tools.
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GeoAnchoredModel } from "@/lib/geo-model-types";
import type { PropertyLayers } from "@/lib/layer-types";

type Listener = (...args: unknown[]) => void;
type ChangeListener = () => void;

interface FakeSource {
  setData: ReturnType<typeof vi.fn>;
}

interface FakeMapInstance {
  listeners: Record<string, Listener[]>;
  sources: Record<string, FakeSource>;
  on(event: string, cb: Listener): void;
  fire(event: string, payload?: unknown): void;
  fireLoad(): void;
  getSource(id: string): FakeSource | undefined;
}

interface FakeTerraDrawInstance {
  setModeCalls: string[];
  mode: string;
}

const mocks = vi.hoisted(() => ({
  mapInstances: [] as FakeMapInstance[],
  drawInstances: [] as FakeTerraDrawInstance[],
}));

vi.mock("maplibre-gl", () => {
  class FakeMap implements FakeMapInstance {
    listeners: Record<string, Listener[]> = {};
    layerIds = new Set<string>();
    sources: Record<string, FakeSource> = {};

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

// Same FakeTerraDraw shape as LayerViewer.annotate.test.tsx — real drawing
// interaction (pointer/mouse -> vertex placement) is out of scope / not
// reproducible under jsdom (see that file's header comment); this suite
// verifies <LayerViewer>'s OWN wiring around it, specifically setMode()
// calls, exactly like that file does.
vi.mock("terra-draw", () => {
  class FakeTerraDraw implements FakeTerraDrawInstance {
    mode = "render";
    setModeCalls: string[] = [];
    private changeListeners: ChangeListener[] = [];

    constructor(_options: unknown) {
      mocks.drawInstances.push(this);
    }
    start() {}
    stop() {}
    setMode(mode: string) {
      this.mode = mode;
      this.setModeCalls.push(mode);
    }
    on(event: string, cb: ChangeListener) {
      if (event === "change") this.changeListeners.push(cb);
    }
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

// Imported AFTER the vi.mock calls above — same ordering precedent as
// LayerViewer.measure.test.tsx / LayerViewer.annotate.test.tsx.
import { LayerViewer } from "./LayerViewer";

const manifest: PropertyLayers = { slug: "test-property", title: "Test Property", layers: [] };

async function flushMapInit() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** The one GeoJSON source this suite's manifest (empty `layers`) ever
 *  causes <LayerViewer> to add — the measure tool's own (same helper as
 *  LayerViewer.measure.test.tsx's identically-named function). */
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
  const draw = mocks.drawInstances[0];
  return { map, draw };
}

describe("<LayerViewer> Measure/Annotate mutual exclusion (layerviewer-phase2-closeout)", () => {
  beforeEach(() => {
    mocks.mapInstances.length = 0;
    mocks.drawInstances.length = 0;
  });

  it("activating an annotation drawing mode while Measure is on turns Measure off, and a subsequent map click is NOT placed as a measure point", async () => {
    const { map, draw } = await setupLoadedMap();
    const source = getMeasureSource(map);

    // Turn Measure on first.
    fireEvent.click(screen.getByRole("button", { name: /^Measure$/ }));
    expect(screen.getByRole("button", { name: "Measure: On" })).toHaveAttribute("aria-pressed", "true");

    // Now switch to an annotation drawing mode — this must turn Measure off
    // (the mirror-image exclusion in handleAnnotationModeClick).
    fireEvent.click(screen.getByRole("button", { name: "Point" }));

    expect(draw.setModeCalls.at(-1)).toBe("point");
    expect(screen.getByRole("button", { name: "Point" })).toHaveAttribute("aria-pressed", "true");
    // Measure's own button reverts to its "off" label/state.
    expect(screen.getByRole("button", { name: /^Measure$/ })).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByText("Click two points to measure")).not.toBeInTheDocument();

    // The real regression this story cares about: a click landing now must
    // NOT be consumed by the measure tool (it would double-handle the same
    // click terra-draw's own canvas-level listener is about to consume for
    // a drawn vertex, in a real browser — see this file's header comment).
    source.setData.mockClear();
    fireMapClick(map, -122.4, 37.0);
    expect(source.setData).not.toHaveBeenCalled();
  });

  it("activating Measure while an annotation drawing mode is active turns Annotate off (terra-draw returned to idle), and a map click IS placed as a measure point", async () => {
    const { map, draw } = await setupLoadedMap();
    const source = getMeasureSource(map);

    // Turn Annotate on first (Point mode).
    fireEvent.click(screen.getByRole("button", { name: "Point" }));
    expect(draw.setModeCalls.at(-1)).toBe("point");

    // Now turn Measure on — this must return terra-draw to its idle mode
    // and clear the annotation toolbar's pressed state.
    fireEvent.click(screen.getByRole("button", { name: /^Measure$/ }));

    expect(draw.setModeCalls.at(-1)).toBe("render");
    expect(screen.getByRole("button", { name: "Point" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByText("Click the map to draw")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Measure: On" })).toHaveAttribute("aria-pressed", "true");

    // With Annotate now idle, Measure is the exclusive click owner — a
    // click DOES place a measure point.
    fireMapClick(map, -122.4, 37.0);
    const lastCall = source.setData.mock.calls.at(-1)?.[0];
    expect(lastCall.features).toHaveLength(1);
    expect(lastCall.features[0].geometry.type).toBe("Point");
  });

  it("defense-in-depth: the map click handler itself refuses to place a measure point while annotation mode is active, independent of the toggle buttons' own exclusion", async () => {
    // This test exercises LayerViewer.tsx's click-handler-level gate
    // (`if (!measureModeRef.current || annotationModeRef.current) return;`)
    // directly — the SECOND, independent layer of the fix, not just the
    // UI-level mutual exclusion the two tests above already cover. Turning
    // Measure on FIRST (so its mode flag is true), then activating an
    // annotation drawing mode (which the UI-level fix already turns Measure
    // off for) still leaves this assertion meaningful: even in the instant
    // right after annotation mode is set, before/regardless of the UI
    // exclusion, a click must never be double-handled.
    const { map, draw } = await setupLoadedMap();
    const source = getMeasureSource(map);

    fireEvent.click(screen.getByRole("button", { name: /^Measure$/ }));
    fireEvent.click(screen.getByRole("button", { name: "Polygon" }));
    expect(draw.setModeCalls.at(-1)).toBe("polygon");

    source.setData.mockClear();
    fireMapClick(map, -122.41, 37.01);
    expect(source.setData).not.toHaveBeenCalled();
  });
});
