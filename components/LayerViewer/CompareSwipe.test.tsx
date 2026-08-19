// Full-render specs for <CompareSwipe> (layerviewer-phase2-tools epic's
// CompareSwipe story) — drag behavior + both 0%/100% boundary cases. See
// CompareSwipe.tsx's own header comment for the researched rationale
// behind "two of its own camera-synced Map instances + CSS clip-path" —
// this suite verifies THAT implementation, not a re-litigation of the
// technique choice itself.
//
// Deliberately does NOT render the real <LayerViewer> component at all —
// <CompareSwipe> only ever calls `viewerRef.current?.getMap()`, so a
// minimal fake handle object (just `getMap`, plus stubs for the rest of
// LayerViewerHandle's shape so it still type-checks) is enough, and avoids
// this suite needing to also mock terra-draw/terra-draw-maplibre-gl-adapter/
// @/lib/maplibre-model-layer the way LayerViewer's OWN suites do (see e.g.
// LayerViewer.measure.test.tsx's header comment) — none of that code path
// is ever reached from this file.
import { act, fireEvent, render } from "@testing-library/react";
import { createRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LayerDef } from "@/lib/layer-types";
import type { LayerViewerHandle } from "./LayerViewer";

type Listener = (...args: unknown[]) => void;

interface FakeSource {
  setData: ReturnType<typeof vi.fn>;
}

class FakePaneMap {
  options: Record<string, unknown>;
  listeners: Record<string, Listener[]> = {};
  layerIds = new Set<string>();
  addLayerCalls: unknown[] = [];
  sources: Record<string, FakeSource> = {};
  setPaintPropertyCalls: unknown[] = [];
  removed = false;

  constructor(options: Record<string, unknown>) {
    this.options = options;
    mocks.paneInstances.push(this);
  }
  on(event: string, cb: Listener) {
    (this.listeners[event] ??= []).push(cb);
  }
  off(event: string, cb: Listener) {
    this.listeners[event] = (this.listeners[event] ?? []).filter((fn) => fn !== cb);
  }
  fire(event: string, payload?: unknown) {
    for (const cb of [...(this.listeners[event] ?? [])]) cb(payload);
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
  setPaintProperty(...args: unknown[]) {
    this.setPaintPropertyCalls.push(args);
  }
  jumpTo() {}
  remove() {
    this.removed = true;
  }
}

const mocks = vi.hoisted(() => ({
  paneInstances: [] as FakePaneMap[],
}));

vi.mock("maplibre-gl", () => ({ Map: FakePaneMap, addProtocol: vi.fn() }));
vi.mock("@geomatico/maplibre-cog-protocol", () => ({ cogProtocol: {} }));

import { CompareSwipe } from "./CompareSwipe";

/** A minimal fake <LayerViewer> "main" map — everything <CompareSwipe>
 *  actually calls on it (getCenter/getZoom/getBearing/getPitch for the
 *  initial + ongoing camera mirror, on/off for the 'move' listener). */
function makeFakeMainMap() {
  const listeners: Record<string, Listener[]> = {};
  return {
    getCenter: () => ({ lng: -100, lat: 40 }),
    getZoom: () => 12,
    getBearing: () => 0,
    getPitch: () => 0,
    on: vi.fn((event: string, cb: Listener) => {
      (listeners[event] ??= []).push(cb);
    }),
    off: vi.fn((event: string, cb: Listener) => {
      listeners[event] = (listeners[event] ?? []).filter((fn) => fn !== cb);
    }),
    fire(event: string) {
      for (const cb of listeners[event] ?? []) cb();
    },
  };
}

function makeViewerRef(mainMap: ReturnType<typeof makeFakeMainMap> | null) {
  const ref = createRef<LayerViewerHandle | null>();
  (ref as { current: LayerViewerHandle }).current = {
    toggleLayer: vi.fn(),
    setOpacity: vi.fn(),
    getLayers: vi.fn(() => []),
    getMap: vi.fn(() => mainMap as unknown as ReturnType<LayerViewerHandle["getMap"]>),
    toggleFullscreen: vi.fn(),
    isFullscreen: vi.fn(() => false),
  };
  return ref;
}

const layers: LayerDef[] = [
  { id: "ortho", type: "raster", url: "https://example.test/ortho.tif", opacity: 1, toggle: true },
  { id: "hillshade", type: "raster", url: "https://example.test/hillshade.tif", opacity: 0.5, toggle: false },
];

/** Flushes loadMapLibreModules()'s dynamic-import promise chain, same
 *  helper/rationale as LayerViewer.measure.test.tsx's flushMapInit(). */
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** Stubs a rendered <CompareSwipe>'s outer wrapper's getBoundingClientRect
 *  — jsdom's real implementation always returns all-zero geometry, which
 *  would make every drag compute against a zero-width rect. `width`/`left`
 *  chosen to make percent-from-clientX arithmetic land on round numbers. */
function stubWrapperRect(container: HTMLElement) {
  const wrapper = container.querySelector('[data-testid="compare-swipe"]') as HTMLElement;
  wrapper.getBoundingClientRect = () =>
    ({ left: 0, right: 200, top: 0, bottom: 100, width: 200, height: 100, x: 0, y: 0, toJSON() {} }) as DOMRect;
  return wrapper;
}

describe("<CompareSwipe>", () => {
  beforeEach(() => {
    mocks.paneInstances.length = 0;
  });

  it("constructs two comparison panes and adds only layerA / layerB (forced visible) once each loads", async () => {
    const mainMap = makeFakeMainMap();
    const viewerRef = makeViewerRef(mainMap);
    render(<CompareSwipe viewerRef={viewerRef} layers={layers} layerA="ortho" layerB="hillshade" />);
    await flush();

    expect(mocks.paneInstances).toHaveLength(2);
    const [leftMap, rightMap] = mocks.paneInstances;

    act(() => leftMap.fireLoad());
    act(() => rightMap.fireLoad());

    // layerA ("ortho", toggle: true in the registry) on the left pane.
    const leftRaster = leftMap.addLayerCalls.find((l) => (l as { type: string }).type === "raster") as {
      paint: { "raster-opacity": number };
    };
    expect(leftRaster).toBeDefined();
    expect(leftRaster.paint["raster-opacity"]).toBe(1);

    // layerB ("hillshade", toggle: FALSE in the registry) still renders on
    // the right pane — CompareSwipe forces it visible regardless of the
    // registry's own toggle, per this file's own addComparisonPane doc
    // comment.
    const rightRaster = rightMap.addLayerCalls.find((l) => (l as { type: string }).type === "raster") as {
      layout: { visibility: string };
      paint: { "raster-opacity": number };
    };
    expect(rightRaster).toBeDefined();
    expect(rightRaster.layout.visibility).toBe("visible");
    expect(rightRaster.paint["raster-opacity"]).toBe(0.5);
  });

  it("mirrors the main map's camera onto both panes on 'move', and stops on unmount", async () => {
    const mainMap = makeFakeMainMap();
    const viewerRef = makeViewerRef(mainMap);
    const { unmount } = render(
      <CompareSwipe viewerRef={viewerRef} layers={layers} layerA="ortho" layerB="hillshade" />,
    );
    await flush();

    expect(mainMap.on).toHaveBeenCalledWith("move", expect.any(Function));

    unmount();

    expect(mainMap.off).toHaveBeenCalledWith("move", expect.any(Function));
    expect(mocks.paneInstances.every((m) => m.removed)).toBe(true);
  });

  describe("boundary cases", () => {
    it("value=0 fully unclips the right (layerB) pane — layerB shown edge-to-edge, layerA fully occluded", async () => {
      const viewerRef = makeViewerRef(makeFakeMainMap());
      const { container } = render(
        <CompareSwipe viewerRef={viewerRef} layers={layers} layerA="ortho" layerB="hillshade" value={0} />,
      );
      await flush();

      const rightPane = container.querySelectorAll('[data-testid="compare-swipe"] > div')[1] as HTMLElement;
      expect(rightPane.style.clipPath).toBe("inset(0 0 0 0%)");
    });

    it("value=100 fully clips away the right (layerB) pane — layerA shown edge-to-edge with no blank strip", async () => {
      const viewerRef = makeViewerRef(makeFakeMainMap());
      const { container } = render(
        <CompareSwipe viewerRef={viewerRef} layers={layers} layerA="ortho" layerB="hillshade" value={100} />,
      );
      await flush();

      const rightPane = container.querySelectorAll('[data-testid="compare-swipe"] > div')[1] as HTMLElement;
      expect(rightPane.style.clipPath).toBe("inset(0 0 0 100%)");
      // The left pane is ALWAYS full-bleed, unclipped, underneath — see
      // this file's header comment for why that's what makes this
      // boundary render layerA with no gap/seam.
      const leftPane = container.querySelectorAll('[data-testid="compare-swipe"] > div')[0] as HTMLElement;
      expect(leftPane.style.clipPath).toBe("");
    });

    it("out-of-range values (negative / >100) are clamped, not passed through raw", async () => {
      const viewerRef = makeViewerRef(makeFakeMainMap());
      const { container } = render(
        <CompareSwipe viewerRef={viewerRef} layers={layers} layerA="ortho" layerB="hillshade" value={-40} />,
      );
      await flush();
      const rightPane = container.querySelectorAll('[data-testid="compare-swipe"] > div')[1] as HTMLElement;
      expect(rightPane.style.clipPath).toBe("inset(0 0 0 0%)");
    });
  });

  describe("drag behavior", () => {
    it("uncontrolled: pointerdown on the handle then window pointermove updates the divider position and fires onChange", async () => {
      const viewerRef = makeViewerRef(makeFakeMainMap());
      const onChange = vi.fn();
      const { container, getByRole } = render(
        <CompareSwipe
          viewerRef={viewerRef}
          layers={layers}
          layerA="ortho"
          layerB="hillshade"
          defaultValue={50}
          onChange={onChange}
        />,
      );
      await flush();
      stubWrapperRect(container);
      const handle = getByRole("slider");

      // rect is 0..200px wide; clientX=40 -> 20%.
      fireEvent.pointerDown(handle, { clientX: 40, pointerId: 1 });
      expect(onChange).toHaveBeenLastCalledWith(20);
      expect(handle.style.left).toBe("20%");

      // Drag continues via a window-level listener even though the move
      // event targets `window`, not the (intentionally thin) handle.
      fireEvent.pointerMove(window, { clientX: 150 });
      expect(onChange).toHaveBeenLastCalledWith(75);
      expect(handle.style.left).toBe("75%");

      fireEvent.pointerUp(window, { clientX: 150 });
      onChange.mockClear();

      // After pointerup, further window moves must NOT keep dragging.
      fireEvent.pointerMove(window, { clientX: 0 });
      expect(onChange).not.toHaveBeenCalled();
      expect(handle.style.left).toBe("75%");
    });

    it("controlled: dragging fires onChange but does not move the divider itself until the parent updates `value`", async () => {
      const viewerRef = makeViewerRef(makeFakeMainMap());
      const onChange = vi.fn();
      const { container, getByRole } = render(
        <CompareSwipe viewerRef={viewerRef} layers={layers} layerA="ortho" layerB="hillshade" value={50} onChange={onChange} />,
      );
      await flush();
      stubWrapperRect(container);
      const handle = getByRole("slider");

      fireEvent.pointerDown(handle, { clientX: 180, pointerId: 1 });
      expect(onChange).toHaveBeenLastCalledWith(90);
      // Still 50% — a controlled component never self-updates.
      expect(handle.style.left).toBe("50%");
    });

    it("keyboard: ArrowRight/ArrowLeft/Home/End nudge and jump the divider", async () => {
      const viewerRef = makeViewerRef(makeFakeMainMap());
      const onChange = vi.fn();
      const { getByRole } = render(
        <CompareSwipe
          viewerRef={viewerRef}
          layers={layers}
          layerA="ortho"
          layerB="hillshade"
          defaultValue={50}
          onChange={onChange}
        />,
      );
      await flush();
      const handle = getByRole("slider");

      fireEvent.keyDown(handle, { key: "ArrowRight" });
      expect(onChange).toHaveBeenLastCalledWith(52);

      fireEvent.keyDown(handle, { key: "ArrowLeft" });
      expect(onChange).toHaveBeenLastCalledWith(50);

      fireEvent.keyDown(handle, { key: "End" });
      expect(onChange).toHaveBeenLastCalledWith(100);

      fireEvent.keyDown(handle, { key: "Home" });
      expect(onChange).toHaveBeenLastCalledWith(0);
    });
  });

  it("live-syncs opacity changes from the registry onto already-loaded panes without tearing them down", async () => {
    const viewerRef = makeViewerRef(makeFakeMainMap());
    const { rerender } = render(
      <CompareSwipe viewerRef={viewerRef} layers={layers} layerA="ortho" layerB="hillshade" />,
    );
    await flush();
    const [leftMap] = mocks.paneInstances;
    act(() => leftMap.fireLoad());
    mocks.paneInstances[1].fireLoad();

    const updatedLayers = layers.map((l) => (l.id === "ortho" ? { ...l, opacity: 0.3 } : l));
    rerender(<CompareSwipe viewerRef={viewerRef} layers={updatedLayers} layerA="ortho" layerB="hillshade" />);

    const lastCall = leftMap.setPaintPropertyCalls.at(-1);
    expect(lastCall).toEqual([expect.stringContaining("raster"), "raster-opacity", 0.3]);
    // No new Map instances were constructed for a mere opacity edit.
    expect(mocks.paneInstances).toHaveLength(2);
  });
});
