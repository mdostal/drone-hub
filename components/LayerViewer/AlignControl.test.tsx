// Specs for <AlignControl> (layerviewer-phase2-tools epic's AlignControl
// story). See AlignControl.tsx's own header comment for the researched
// rationale behind "no raster-translate paint property exists in MapLibre
// GL — reuse CompareSwipe's camera-shifted second Map instance technique" —
// this suite verifies THAT implementation (plus the pure meters<->degrees
// math it depends on), not a re-litigation of the technique choice itself.
//
// Two tiers, same split LayerViewer.test.tsx/CompareSwipe.test.tsx already
// use: pure-function numeric checks first (no React, no MapLibre at all),
// then full-render specs against a fake MapLibre `Map` (mirrors
// CompareSwipe.test.tsx's own FakePaneMap harness exactly, plus a fuller
// fake for the REAL map since, unlike CompareSwipe, AlignControl also
// mutates the real map's layer visibility, not just reads its camera).
import { act, fireEvent, render } from "@testing-library/react";
import { createRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LayerDef } from "@/lib/layer-types";
import type { LayerViewerHandle } from "./LayerViewer";
import {
  ALIGN_STEP_METERS,
  computeGhostCenter,
  isZeroOffset,
  metersToLngLatOffset,
  nudgeOffset,
} from "./AlignControl";

describe("metersToLngLatOffset (pure numeric check)", () => {
  it("converts a pure-north offset to a latitude delta, independent of longitude/latitude", () => {
    // 111_320 m is exactly METERS_PER_DEGREE_LAT — a north offset of that
    // size must be exactly 1 degree of latitude, at ANY latitude (latitude
    // degrees don't shrink with distance from the equator the way
    // longitude degrees do).
    expect(metersToLngLatOffset({ north: 111_320, east: 0 }, 0)).toEqual({ lat: 1, lng: 0 });
    expect(metersToLngLatOffset({ north: 111_320, east: 0 }, 60)).toEqual({ lat: 1, lng: 0 });
    expect(metersToLngLatOffset({ north: -111_320, east: 0 }, 0).lat).toBeCloseTo(-1, 10);
  });

  it("converts a pure-east offset to a longitude delta that SHRINKS with cos(latitude)", () => {
    // At the equator, a degree of longitude is (to this function's model)
    // exactly as wide as a degree of latitude.
    const atEquator = metersToLngLatOffset({ north: 0, east: 111_320 }, 0);
    expect(atEquator.lng).toBeCloseTo(1, 10);

    // At 60°N, cos(60°) = 0.5 exactly — a degree of longitude covers HALF
    // the ground distance it does at the equator, so the SAME east-meters
    // offset must produce TWICE the longitude delta.
    const at60 = metersToLngLatOffset({ north: 0, east: 111_320 }, 60);
    expect(at60.lng).toBeCloseTo(2, 10);

    // 45°: cos(45°) = √2/2 — verify the exact expected ratio, not just "> 1".
    const at45 = metersToLngLatOffset({ north: 0, east: 111_320 }, 45);
    expect(at45.lng).toBeCloseTo(1 / Math.cos((45 * Math.PI) / 180), 10);
  });

  it("north and east convert independently — a combined offset is exactly the sum of each part alone", () => {
    const combined = metersToLngLatOffset({ north: 55_660, east: 27_830 }, 30);
    const northOnly = metersToLngLatOffset({ north: 55_660, east: 0 }, 30);
    const eastOnly = metersToLngLatOffset({ north: 0, east: 27_830 }, 30);
    expect(combined.lat).toBeCloseTo(northOnly.lat, 12);
    expect(combined.lng).toBeCloseTo(eastOnly.lng, 12);
  });
});

describe("computeGhostCenter (pure numeric check)", () => {
  it("shifts the ghost camera OPPOSITE the desired visual offset (so content appears to move the intended direction)", () => {
    // At the equator, a north+east offset of 111_320m each is exactly a
    // +1 lat / +1 lng delta (per metersToLngLatOffset above) — the ghost
    // camera must sit at exactly -1/-1 from the real map's center.
    const ghostCenter = computeGhostCenter({ lng: 0, lat: 0 }, { north: 111_320, east: 111_320 });
    expect(ghostCenter).toEqual({ lng: -1, lat: -1 });
  });

  it("a north-only nudge moves the ghost camera SOUTH, never touching longitude", () => {
    const ghostCenter = computeGhostCenter({ lng: -97.5, lat: 30 }, { north: 55.66, east: 0 });
    expect(ghostCenter.lng).toBe(-97.5);
    expect(ghostCenter.lat).toBeLessThan(30);
  });

  it("a zero offset leaves the ghost camera exactly at the real map's center", () => {
    expect(computeGhostCenter({ lng: 12.34, lat: -5.67 }, { north: 0, east: 0 })).toEqual({ lng: 12.34, lat: -5.67 });
  });
});

describe("nudgeOffset (pure reducer — layer independence)", () => {
  it("accumulates deltas for the target layer only", () => {
    let offsets = nudgeOffset({}, "ortho", { north: ALIGN_STEP_METERS, east: 0 });
    offsets = nudgeOffset(offsets, "ortho", { north: 0, east: ALIGN_STEP_METERS });
    expect(offsets.ortho).toEqual({ north: 0.25, east: 0.25 });
  });

  it("nudging one layer does NOT affect any other layer's stored offset — same object reference, not just equal value", () => {
    const initial = { hillshade: { north: 1.5, east: -2 } };
    const next = nudgeOffset(initial, "ortho", { north: 0.25, east: 0 });

    expect(next.ortho).toEqual({ north: 0.25, east: 0 });
    // The untouched layer's entry is the SAME reference, proving nudgeOffset
    // never iterates/rewrites entries it wasn't asked to change.
    expect(next.hillshade).toBe(initial.hillshade);
  });

  it("Reset (isZeroOffset) only reports true for an exact {0,0}", () => {
    expect(isZeroOffset({ north: 0, east: 0 })).toBe(true);
    expect(isZeroOffset({ north: 0.01, east: 0 })).toBe(false);
    expect(isZeroOffset({ north: 0, east: -0.01 })).toBe(false);
  });
});

// ---------------------------------------------------------------------
// Full-render specs, against fake MapLibre Map instances.
// ---------------------------------------------------------------------

type Listener = () => void;

/** The GHOST pane's fake `Map` — mirrors CompareSwipe.test.tsx's own
 *  FakePaneMap exactly (same constructor-registers-itself pattern), scoped
 *  to what AlignControl actually calls on it. */
class FakeGhostMap {
  options: Record<string, unknown>;
  listeners: Record<string, Listener[]> = {};
  addLayerCalls: unknown[] = [];
  addSourceCalls: { id: string; source: unknown }[] = [];
  jumpToCalls: { center: { lng: number; lat: number } }[] = [];
  removed = false;

  constructor(options: Record<string, unknown>) {
    this.options = options;
    mocks.ghostInstances.push(this);
  }
  on(event: string, cb: Listener) {
    (this.listeners[event] ??= []).push(cb);
  }
  fire(event: string) {
    for (const cb of [...(this.listeners[event] ?? [])]) cb();
  }
  fireLoad() {
    this.fire("load");
  }
  addSource(id: string, source: unknown) {
    this.addSourceCalls.push({ id, source });
  }
  addLayer(layer: { id: string; type: string }) {
    this.addLayerCalls.push(layer);
  }
  jumpTo(opts: { center: { lng: number; lat: number } }) {
    this.jumpToCalls.push(opts);
  }
  remove() {
    this.removed = true;
  }
}

const mocks = vi.hoisted(() => ({
  ghostInstances: [] as FakeGhostMap[],
}));

vi.mock("maplibre-gl", () => ({ Map: FakeGhostMap, addProtocol: vi.fn() }));
vi.mock("@geomatico/maplibre-cog-protocol", () => ({ cogProtocol: {} }));

import { AlignControl } from "./AlignControl";

/** A fuller fake for the REAL (<LayerViewer>'s own) map — unlike
 *  CompareSwipe (camera reads only), AlignControl also force-hides/
 *  restores the selected layer's own map layers on THIS map, so this fake
 *  tracks those calls too. `getLayer` always returns truthy for any id —
 *  reflecting that, in real usage, <LayerViewer>'s own 'load' handler has
 *  already added every non-disabled layer's map layer(s) long before
 *  <AlignControl> ever touches this map. */
function makeFakeMainMap() {
  const listeners: Record<string, Listener[]> = {};
  const setLayoutPropertyCalls: [string, string, string][] = [];
  const setPaintPropertyCalls: [string, string, unknown][] = [];
  return {
    center: { lng: -97.5, lat: 30.2 },
    getCenter() {
      return this.center;
    },
    getZoom: () => 14,
    getBearing: () => 0,
    getPitch: () => 0,
    getLayer: (id: string) => ({ id }),
    setLayoutProperty(id: string, prop: string, value: string) {
      setLayoutPropertyCalls.push([id, prop, value]);
    },
    setPaintProperty(id: string, prop: string, value: unknown) {
      setPaintPropertyCalls.push([id, prop, value]);
    },
    setLayoutPropertyCalls,
    setPaintPropertyCalls,
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
  { id: "ortho", type: "raster", format: "cog", url: "https://example.test/ortho.tif", opacity: 1, toggle: true },
  {
    id: "hillshade",
    type: "raster",
    format: "cog",
    url: "https://example.test/hillshade.tif",
    opacity: 0.6,
    toggle: false,
  },
  { id: "thermal", type: "raster", url: null, opacity: 1, toggle: false, disabled: true },
];

/** Flushes loadMapLibreModules()'s dynamic-import promise chain, same
 *  helper/rationale as LayerViewer.measure.test.tsx / CompareSwipe.test.tsx. */
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("<AlignControl>", () => {
  beforeEach(() => {
    mocks.ghostInstances.length = 0;
  });

  it("lists only non-disabled, url-bearing layers in the selector — excludes the disabled thermal stub", async () => {
    const viewerRef = makeViewerRef(makeFakeMainMap());
    const { getByLabelText } = render(<AlignControl viewerRef={viewerRef} layers={layers} />);
    await flush();

    const select = getByLabelText("Layer being aligned") as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues).toEqual(["ortho", "hillshade"]);
  });

  it("defaults to the first alignable layer with a zero offset readout, and Reset starts disabled", async () => {
    const viewerRef = makeViewerRef(makeFakeMainMap());
    const { getByLabelText, getByText } = render(<AlignControl viewerRef={viewerRef} layers={layers} />);
    await flush();

    expect((getByLabelText("Layer being aligned") as HTMLSelectElement).value).toBe("ortho");
    expect(getByText("0.00m N, 0.00m E")).toBeTruthy();
    expect(getByText("Reset")).toBeDisabled();
  });

  it("clicking a D-pad button accumulates the offset, updates the readout, and fires onAlignmentChange", async () => {
    const viewerRef = makeViewerRef(makeFakeMainMap());
    const onAlignmentChange = vi.fn();
    const { getByLabelText, getByText } = render(
      <AlignControl viewerRef={viewerRef} layers={layers} onAlignmentChange={onAlignmentChange} />,
    );
    await flush();

    fireEvent.click(getByLabelText("Nudge north"));
    expect(getByText(`${ALIGN_STEP_METERS.toFixed(2)}m N, 0.00m E`)).toBeTruthy();
    expect(onAlignmentChange).toHaveBeenLastCalledWith("ortho", { north: ALIGN_STEP_METERS, east: 0 });

    fireEvent.click(getByLabelText("Nudge east"));
    expect(getByText(`${ALIGN_STEP_METERS.toFixed(2)}m N, ${ALIGN_STEP_METERS.toFixed(2)}m E`)).toBeTruthy();
    expect(onAlignmentChange).toHaveBeenLastCalledWith("ortho", {
      north: ALIGN_STEP_METERS,
      east: ALIGN_STEP_METERS,
    });

    fireEvent.click(getByLabelText("Nudge south"));
    fireEvent.click(getByLabelText("Nudge west"));
    expect(getByText("0.00m N, 0.00m E")).toBeTruthy();
    expect(onAlignmentChange).toHaveBeenLastCalledWith("ortho", { north: 0, east: 0 });
  });

  it("Reset zeros the SELECTED layer's offset and fires onAlignmentChange with {0,0}", async () => {
    const viewerRef = makeViewerRef(makeFakeMainMap());
    const onAlignmentChange = vi.fn();
    const { getByLabelText, getByText } = render(
      <AlignControl viewerRef={viewerRef} layers={layers} onAlignmentChange={onAlignmentChange} />,
    );
    await flush();

    fireEvent.click(getByLabelText("Nudge north"));
    expect(getByText("Reset")).not.toBeDisabled();

    fireEvent.click(getByText("Reset"));
    expect(getByText("0.00m N, 0.00m E")).toBeTruthy();
    expect(getByText("Reset")).toBeDisabled();
    expect(onAlignmentChange).toHaveBeenLastCalledWith("ortho", { north: 0, east: 0 });
  });

  it("a non-zero offset hides ONLY the selected (ortho) layer on the real map and builds a ghost pane for ONLY ortho — hillshade is never touched", async () => {
    const mainMap = makeFakeMainMap();
    const viewerRef = makeViewerRef(mainMap);
    const { getByLabelText } = render(<AlignControl viewerRef={viewerRef} layers={layers} />);
    await flush();

    // Ghost `Map` constructed for the default selection (ortho) and loaded.
    expect(mocks.ghostInstances).toHaveLength(1);
    const ghost = mocks.ghostInstances[0];
    act(() => ghost.fireLoad());

    // Ghost pane only ever added ortho's own source/layer — never hillshade's.
    expect(ghost.addSourceCalls.some((c) => c.id.includes("ortho"))).toBe(true);
    expect(ghost.addSourceCalls.some((c) => c.id.includes("hillshade"))).toBe(false);
    expect(ghost.addLayerCalls.some((l) => (l as { id: string }).id.includes("hillshade"))).toBe(false);

    fireEvent.click(getByLabelText("Nudge north"));

    // Real map: ortho's own layer id(s) got hidden; no call ever mentions
    // hillshade's id at all.
    expect(mainMap.setLayoutPropertyCalls.some(([id, , value]) => id.includes("ortho") && value === "none")).toBe(
      true,
    );
    expect(mainMap.setLayoutPropertyCalls.some(([id]) => id.includes("hillshade"))).toBe(false);

    // Ghost pane's camera shifted (jumpTo called again after the nudge,
    // with a center different from the un-offset main map center).
    const lastJump = ghost.jumpToCalls.at(-1);
    expect(lastJump?.center).not.toEqual(mainMap.getCenter());
  });

  it("switching the selection away from a hidden layer restores it on the real map (via updateLayerOnMap, respecting its OWN toggle/opacity)", async () => {
    const mainMap = makeFakeMainMap();
    const viewerRef = makeViewerRef(mainMap);
    const { getByLabelText } = render(<AlignControl viewerRef={viewerRef} layers={layers} />);
    await flush();
    act(() => mocks.ghostInstances[0].fireLoad());

    fireEvent.click(getByLabelText("Nudge north"));
    expect(mainMap.setLayoutPropertyCalls.some(([id, , value]) => id.includes("ortho") && value === "none")).toBe(
      true,
    );

    // Switch selection to hillshade — a fresh ghost `Map` is constructed
    // (selectedLayerId identity change), and ortho (no longer active) must
    // be restored: `updateLayerOnMap` sets its visibility back to
    // "visible" (its registry `toggle` is true) — a literal, real MapLibre
    // call, not just an internal flag.
    fireEvent.change(getByLabelText("Layer being aligned"), { target: { value: "hillshade" } });
    await flush();

    expect(
      mainMap.setLayoutPropertyCalls.some(([id, prop, value]) => id.includes("ortho") && prop === "visibility" && value === "visible"),
    ).toBe(true);

    // The new ghost pane is for hillshade only.
    expect(mocks.ghostInstances).toHaveLength(2);
    const secondGhost = mocks.ghostInstances[1];
    act(() => secondGhost.fireLoad());
    expect(secondGhost.addSourceCalls.some((c) => c.id.includes("hillshade"))).toBe(true);
    expect(secondGhost.addSourceCalls.some((c) => c.id.includes("ortho"))).toBe(false);
  });

  it("unmounting restores a currently-hidden layer and tears down the ghost Map", async () => {
    const mainMap = makeFakeMainMap();
    const viewerRef = makeViewerRef(mainMap);
    const { getByLabelText, unmount } = render(<AlignControl viewerRef={viewerRef} layers={layers} />);
    await flush();
    act(() => mocks.ghostInstances[0].fireLoad());

    fireEvent.click(getByLabelText("Nudge north"));
    unmount();

    expect(
      mainMap.setLayoutPropertyCalls.some(([id, prop, value]) => id.includes("ortho") && prop === "visibility" && value === "visible"),
    ).toBe(true);
    expect(mocks.ghostInstances[0].removed).toBe(true);
  });
});
