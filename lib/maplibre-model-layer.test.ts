// Unit specs for lib/maplibre-model-layer.ts. See that file's own
// "TESTABILITY MAP" header comment for the full breakdown this suite
// mirrors — short version:
//
//   - "matrix math" below: buildModelMatrix/combineMatrices/multiplyMat4 are
//     100% pure array arithmetic. Real unit tests, real oracle values,
//     zero mocking.
//   - "scene graph traversal" below: applyOpacityToSceneGraph/
//     disposeSceneGraph are pure recursive traversals over a minimal
//     structural shape (not THREE.Object3D itself). Exercised here with
//     plain object literals standing in for a loaded glTF's scene graph —
//     real unit tests, zero mocking, zero three.js import.
//   - "createModelLayer" below: this is the one section that mocks
//     anything. jsdom has no WebGL — `new THREE.WebGLRenderer({context: gl,
//     ...})` throws immediately if `gl` isn't a real WebGL context, and a
//     real glTF fetch/parse needs a real network + WebGL-adjacent decode
//     pipeline neither jsdom nor Node provides. So "three" and
//     "three/examples/jsm/loaders/GLTFLoader.js" are replaced with
//     lightweight fakes (vi.mock) that record calls instead of touching
//     WebGL, and "maplibre-gl" is replaced with a minimal
//     MercatorCoordinate stand-in (real `maplibre-gl` can't even be
//     imported under jsdom at all — see LayerViewer.test.tsx's header
//     comment, `ReferenceError`/`TypeError` on browser-only globals the
//     instant the module evaluates). These tests prove createModelLayer's
//     CONTROL FLOW is wired correctly per the 5 design-review corrections
//     (the guards fire, resetState is actually called, disposal walks the
//     right objects) — they do NOT prove the resulting pixels are correct
//     (right on-screen position/scale/perspective, no GL-state corruption
//     against MapLibre's REAL raster/geojson layers). That needs a real
//     WebGL context and real MapLibre map, which is Playwright's job,
//     deferred to this epic's land-overlay-test-suite story per
//     .pHive/epics/land-overlay/docs/design-discussion.md's
//     screen-space-centroid verification method.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GeoAnchoredModel } from "./geo-model-types";

// ---------------------------------------------------------------------------
// Pure matrix math
// ---------------------------------------------------------------------------

import {
  applyOpacityToSceneGraph,
  buildModelMatrix,
  combineMatrices,
  createModelLayer,
  disposeSceneGraph,
  IDENTITY_MAT4,
  type Mat4,
  type MercatorLike,
  multiplyMat4,
} from "./maplibre-model-layer";

/** Test-only oracle: applies a column-major Mat4 to a homogeneous point
 *  (x, y, z, 1) exactly the way a vertex shader would — independent of
 *  multiplyMat4 itself, so these tests aren't just checking the
 *  implementation against itself. */
function applyMat4ToPoint(m: Mat4, x: number, y: number, z: number): [number, number, number] {
  const v = [x, y, z, 1];
  const out: number[] = [0, 0, 0, 0];
  for (let row = 0; row < 4; row++) {
    let sum = 0;
    for (let col = 0; col < 4; col++) {
      sum += m[col * 4 + row] * v[col];
    }
    out[row] = sum;
  }
  return [out[0], out[1], out[2]];
}

describe("multiplyMat4", () => {
  it("identity * identity = identity", () => {
    expect(multiplyMat4(IDENTITY_MAT4, IDENTITY_MAT4)).toEqual(IDENTITY_MAT4);
  });

  it("identity is the multiplicative identity on both sides for an arbitrary matrix", () => {
    const m: Mat4 = [2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 4, 0, 5, 6, 7, 1];
    expect(multiplyMat4(IDENTITY_MAT4, m)).toEqual(m);
    expect(multiplyMat4(m, IDENTITY_MAT4)).toEqual(m);
  });

  it("is not commutative for matrices that don't already commute — regression guard against a row/column-mixup bug that would silently make it look symmetric", () => {
    const translate: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 0, 0, 1];
    const scale: Mat4 = [2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    expect(multiplyMat4(translate, scale)).not.toEqual(multiplyMat4(scale, translate));
  });
});

describe("buildModelMatrix", () => {
  function makeMercator(overrides: Partial<MercatorLike> = {}): MercatorLike {
    return {
      x: 0.5,
      y: 0.5,
      z: 0.1,
      meterInMercatorCoordinateUnits: () => 1e-7,
      ...overrides,
    };
  }

  function makeModel(overrides: Partial<GeoAnchoredModel> = {}): GeoAnchoredModel {
    return { id: "duck", url: "/model.glb", title: "Duck", lat: 73.47, lon: -73, ...overrides };
  }

  it("translates the model's local origin exactly to the mercator anchor point, regardless of scale/rotation", () => {
    // Every build block (rotate, scale) leaves the origin (0,0,0) fixed —
    // only the translation component can move it — so this holds no
    // matter what rotationDegrees/scale are, and is a strong, easy-to-
    // hand-verify oracle for the translation part of the composed matrix.
    const mercator = makeMercator({ x: 0.123, y: 0.456, z: 0.007 });
    const matrix = buildModelMatrix(makeModel({ rotationDegrees: 37, scale: 9 }), mercator);
    expect(applyMat4ToPoint(matrix, 0, 0, 0)).toEqual([0.123, 0.456, 0.007]);
  });

  it("scales a local +X point by scale * meterInMercatorCoordinateUnits() when rotationDegrees is 0", () => {
    // With rotationDegrees=0, the fixed 90° X-axis correction (glTF Y-up ->
    // Mercator Z-up) leaves a point ON the X axis unmoved (rotation about
    // an axis doesn't move points on that axis), so (1,0,0) transforms to
    // exactly (translateX + scale, translateY, translateZ) — a clean,
    // hand-computed expectation.
    const mercator = makeMercator({ x: 10, y: 20, z: 30, meterInMercatorCoordinateUnits: () => 0.001 });
    const matrix = buildModelMatrix(makeModel({ scale: 2 }), mercator);
    const [x, y, z] = applyMat4ToPoint(matrix, 1, 0, 0);
    expect(x).toBeCloseTo(10 + 2 * 0.001);
    expect(y).toBeCloseTo(20);
    expect(z).toBeCloseTo(30);
  });

  it("defaults scale to 1 and rotationDegrees to 0 when omitted", () => {
    const mercator = makeMercator({ meterInMercatorCoordinateUnits: () => 0.5 });
    const withDefaults = buildModelMatrix(makeModel(), mercator);
    const explicit = buildModelMatrix(makeModel({ scale: 1, rotationDegrees: 0 }), mercator);
    expect(withDefaults).toEqual(explicit);
  });

  it("the fixed glTF-Y-up -> Mercator-Z-up correction maps a local +Y point to mercator +Z (rotationDegrees: 0, so only the fixed correction is in play)", () => {
    // Isolates the ALWAYS-APPLIED 90° X-axis correction from the optional
    // yaw, establishing (independently of the next test) which mercator
    // axis a model's local "up" (+Y, glTF convention) actually ends up on.
    const mercator = makeMercator({ x: 0, y: 0, z: 0, meterInMercatorCoordinateUnits: () => 1 });
    const matrix = buildModelMatrix(makeModel({ rotationDegrees: 0, scale: 1 }), mercator);
    const [x, y, z] = applyMat4ToPoint(matrix, 0, 1, 0);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(0);
    expect(z).toBeCloseTo(1);
  });

  it("a 90 degree rotationDegrees yaw composes with the fixed correction: local +X -> (yaw) -> local +Y -> (fixed correction) -> mercator +Z", () => {
    // rotationDegrees rotates in the model's OWN local plane, applied
    // before the fixed up-axis correction (T * S * Rx * Rz — Rz first).
    // A 90° yaw sends local +X to local +Y (standard CCW rotation about
    // Z); the fixed correction then sends that +Y to mercator +Z (per the
    // preceding test) — so the composed result matches that test's,
    // confirming the two rotations compose in the expected order rather
    // than, say, being silently applied in the wrong sequence.
    const mercator = makeMercator({ x: 0, y: 0, z: 0, meterInMercatorCoordinateUnits: () => 1 });
    const matrix = buildModelMatrix(makeModel({ rotationDegrees: 90, scale: 1 }), mercator);
    const [x, y, z] = applyMat4ToPoint(matrix, 1, 0, 0);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(0);
    expect(z).toBeCloseTo(1);
  });
});

describe("combineMatrices", () => {
  it("is a plain matrix multiply of the map matrix and the model matrix", () => {
    const mapMatrix: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 100, 0, 0, 1];
    const modelMatrix: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 5, 0, 1];
    expect(combineMatrices(mapMatrix, modelMatrix)).toEqual(multiplyMat4(mapMatrix, modelMatrix));
  });

  it("the map's identity matrix leaves the model matrix untouched", () => {
    const modelMatrix: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 3, 4, 5, 1];
    expect(combineMatrices(IDENTITY_MAT4, modelMatrix)).toEqual(modelMatrix);
  });
});

// ---------------------------------------------------------------------------
// Pure scene-graph traversal
// ---------------------------------------------------------------------------

describe("applyOpacityToSceneGraph", () => {
  it("stamps transparent:true and the given opacity onto a single-material mesh", () => {
    const material = { transparent: false, opacity: 1 };
    const root = { material, children: [] };
    applyOpacityToSceneGraph(root, 0.5);
    expect(material).toEqual({ transparent: true, opacity: 0.5 });
  });

  it("stamps every material in a multi-material mesh's material array", () => {
    const materials = [
      { transparent: false, opacity: 1 },
      { transparent: false, opacity: 1 },
    ];
    const root = { material: materials, children: [] };
    applyOpacityToSceneGraph(root, 0.25);
    expect(materials).toEqual([
      { transparent: true, opacity: 0.25 },
      { transparent: true, opacity: 0.25 },
    ]);
  });

  it("recurses through nested children, including nodes with no material at all (e.g. a bare Group)", () => {
    const leafMaterial = { transparent: false, opacity: 1 };
    const leaf = { material: leafMaterial, children: [] };
    const emptyGroup = { children: [] }; // no `material` field — a THREE.Group
    const root = { children: [emptyGroup, { children: [leaf] }] };

    expect(() => applyOpacityToSceneGraph(root, 0.7)).not.toThrow();
    expect(leafMaterial).toEqual({ transparent: true, opacity: 0.7 });
  });
});

describe("disposeSceneGraph", () => {
  it("disposes a mesh's geometry and material", () => {
    const geometry = { dispose: vi.fn() };
    const material = { dispose: vi.fn() };
    const root = { geometry, material, children: [] };

    disposeSceneGraph(root);

    expect(geometry.dispose).toHaveBeenCalledTimes(1);
    expect(material.dispose).toHaveBeenCalledTimes(1);
  });

  it("disposes every known texture slot present on a material, but not unrelated properties", () => {
    const mapDispose = vi.fn();
    const normalMapDispose = vi.fn();
    const materialDispose = vi.fn();
    const material = {
      dispose: materialDispose,
      map: { dispose: mapDispose },
      normalMap: { dispose: normalMapDispose },
      color: "not-a-texture", // must not be treated as disposable
      name: "duck-body", // ditto
    };
    const root = { material, children: [] };

    disposeSceneGraph(root);

    expect(mapDispose).toHaveBeenCalledTimes(1);
    expect(normalMapDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
  });

  it("disposes every material in a multi-material array", () => {
    const disposeA = vi.fn();
    const disposeB = vi.fn();
    const root = { material: [{ dispose: disposeA }, { dispose: disposeB }], children: [] };

    disposeSceneGraph(root);

    expect(disposeA).toHaveBeenCalledTimes(1);
    expect(disposeB).toHaveBeenCalledTimes(1);
  });

  it("recurses through nested children and doesn't throw on nodes with no geometry/material", () => {
    const childDispose = vi.fn();
    const root = {
      children: [
        { children: [] }, // bare Group
        { material: { dispose: childDispose }, children: [] },
      ],
    };

    expect(() => disposeSceneGraph(root)).not.toThrow();
    expect(childDispose).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// createModelLayer — control flow only, "three"/GLTFLoader/maplibre-gl
// mocked. See this file's header comment for why.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  pendingLoads: [] as Array<{
    url: string;
    onLoad: (gltf: { scene: unknown }) => void;
    onError?: (err: unknown) => void;
  }>,
  renderers: [] as Array<{ render: ReturnType<typeof vi.fn>; resetState: ReturnType<typeof vi.fn> }>,
}));

vi.mock("three", () => {
  class FakeObject3D {
    children: FakeObject3D[] = [];
    add(obj: FakeObject3D) {
      this.children.push(obj);
    }
    remove(obj: FakeObject3D) {
      this.children = this.children.filter((c) => c !== obj);
    }
  }
  class FakeScene extends FakeObject3D {}
  class FakeMatrix4 {
    elements: number[] = new Array(16).fill(0);
    fromArray(arr: ArrayLike<number>) {
      this.elements = Array.from(arr);
      return this;
    }
  }
  class FakeCamera extends FakeObject3D {
    projectionMatrix = new FakeMatrix4();
  }
  class FakeWebGLRenderer {
    autoClear = true;
    render = vi.fn();
    resetState = vi.fn();
    constructor(_params: unknown) {
      mocks.renderers.push(this);
    }
  }
  return { Scene: FakeScene, Camera: FakeCamera, WebGLRenderer: FakeWebGLRenderer, Matrix4: FakeMatrix4 };
});

vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () => {
  class FakeGLTFLoader {
    load(
      url: string,
      onLoad: (gltf: { scene: unknown }) => void,
      _onProgress?: unknown,
      onError?: (err: unknown) => void,
    ) {
      mocks.pendingLoads.push({ url, onLoad, onError });
    }
  }
  return { GLTFLoader: FakeGLTFLoader };
});

vi.mock("maplibre-gl", () => {
  class FakeMercatorCoordinate {
    x: number;
    y: number;
    z: number;
    constructor(x: number, y: number, z: number) {
      this.x = x;
      this.y = y;
      this.z = z;
    }
    static fromLngLat(_lngLat: unknown, altitude = 0) {
      return new FakeMercatorCoordinate(0.5, 0.5, altitude);
    }
    meterInMercatorCoordinateUnits() {
      return 1e-7;
    }
  }
  return { MercatorCoordinate: FakeMercatorCoordinate };
});

function makeModel(overrides: Partial<GeoAnchoredModel> = {}): GeoAnchoredModel {
  return { id: "duck", url: "/model3d-samples/duck/model.glb", title: "Duck", lat: 73.47, lon: -73, ...overrides };
}

// Loose `any`-typed stand-ins for MapLibre's real `Map`/`gl` params — the
// real `maplibre-gl` module can't even be imported under jsdom (see this
// file's header comment), so there's no real `Map` instance to construct,
// mocked or otherwise. onAdd()/onRemove() only ever call `map.getCanvas()`
// on it, which is all this fake needs to provide.
function fakeMapAndGl() {
  const map = { getCanvas: () => ({}) };
  const gl = {};
  return { map, gl } as unknown as { map: import("maplibre-gl").Map; gl: WebGLRenderingContext };
}

/** A couple of microtask ticks isn't reliably enough to drain
 *  createModelLayer's onAdd() -> Promise.all([...three imports]).then(...)
 *  chain (three separate dynamic imports + two chained .then()s) — a
 *  zero-delay macrotask tick guarantees every already-queued microtask has
 *  run first. */
async function flushOnAdd() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

// render()'s real 3rd param (MapLibre's CustomRenderMethodInput — camera
// near/far/fov/matrices) is untouched by createModelLayer's implementation;
// these tests only care about the first two params, so this stub just
// satisfies the call site's required arity.
const FAKE_RENDER_OPTIONS = {} as unknown as Parameters<ReturnType<typeof createModelLayer>["render"]>[2];

describe("createModelLayer", () => {
  beforeEach(() => {
    mocks.pendingLoads.length = 0;
    mocks.renderers.length = 0;
    vi.clearAllMocks();
  });

  it("returns a CustomLayerInterface shape (id, type: 'custom', onAdd/render/onRemove)", () => {
    const layer = createModelLayer(makeModel({ id: "duck-1" }));
    expect(layer.id).toBe("duck-1");
    expect(layer.type).toBe("custom");
    expect(typeof layer.onAdd).toBe("function");
    expect(typeof layer.render).toBe("function");
    expect(typeof layer.onRemove).toBe("function");
    expect(typeof layer.setOpacity).toBe("function");
    expect(typeof layer.setVisible).toBe("function");
  });

  it("ready-guard: render() before the glTF has loaded returns without throwing and without calling renderer.render()", async () => {
    const layer = createModelLayer(makeModel());
    const { map, gl } = fakeMapAndGl();
    layer.onAdd!(map, gl);
    await flushOnAdd();
    expect(mocks.pendingLoads).toHaveLength(1); // onAdd's async chain ran...
    // ...but the glTF load itself hasn't resolved yet — ready is still false.

    expect(() => layer.render(gl, IDENTITY_MAT4, FAKE_RENDER_OPTIONS)).not.toThrow();
    expect(mocks.renderers[0]?.render).not.toHaveBeenCalled();
  });

  it("render() called immediately after onAdd (before even the lazy module import resolves) is also a safe no-op", () => {
    const layer = createModelLayer(makeModel());
    const { map, gl } = fakeMapAndGl();
    layer.onAdd!(map, gl);
    // No await at all — this is the tightest version of the async-readiness
    // gap the ready-guard exists for.
    expect(() => layer.render(gl, IDENTITY_MAT4, FAKE_RENDER_OPTIONS)).not.toThrow();
  });

  it("once the glTF loads, render() calls renderer.render() and THEN renderer.resetState()", async () => {
    const layer = createModelLayer(makeModel());
    const { map, gl } = fakeMapAndGl();
    layer.onAdd!(map, gl);
    await flushOnAdd();
    expect(mocks.pendingLoads).toHaveLength(1);

    mocks.pendingLoads[0].onLoad({ scene: { children: [] } });

    layer.render(gl, IDENTITY_MAT4, FAKE_RENDER_OPTIONS);

    const renderer = mocks.renderers[0];
    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(renderer.resetState).toHaveBeenCalledTimes(1);
    // Correction 4 is specifically about ORDER (resetState must run AFTER
    // render(), before control returns to MapLibre) — not just "both got
    // called somewhere."
    const renderOrder = renderer.render.mock.invocationCallOrder[0];
    const resetOrder = renderer.resetState.mock.invocationCallOrder[0];
    expect(resetOrder).toBeGreaterThan(renderOrder);
  });

  it("cancelled-guard: onRemove() while GLTFLoader.load() is in flight prevents the later-resolving load from adding to the scene or ever rendering", async () => {
    const layer = createModelLayer(makeModel());
    const { map, gl } = fakeMapAndGl();
    layer.onAdd!(map, gl);
    await flushOnAdd();
    expect(mocks.pendingLoads).toHaveLength(1);

    layer.onRemove!(map, gl);

    // The network/parse "finishes" after unmount — this is the exact race
    // the cancelled flag exists to close.
    const fakeScene = { children: [] };
    expect(() => mocks.pendingLoads[0].onLoad({ scene: fakeScene })).not.toThrow();

    expect(() => layer.render(gl, IDENTITY_MAT4, FAKE_RENDER_OPTIONS)).not.toThrow();
    expect(mocks.renderers[0]?.render).not.toHaveBeenCalled();
  });

  it("setVisible(false) makes render() a no-op even once the model is ready", async () => {
    const layer = createModelLayer(makeModel());
    const { map, gl } = fakeMapAndGl();
    layer.onAdd!(map, gl);
    await flushOnAdd();
    mocks.pendingLoads[0].onLoad({ scene: { children: [] } });

    layer.setVisible(false);
    layer.render(gl, IDENTITY_MAT4, FAKE_RENDER_OPTIONS);

    expect(mocks.renderers[0].render).not.toHaveBeenCalled();
  });

  it("setVisible(true) after setVisible(false) lets render() draw again", async () => {
    const layer = createModelLayer(makeModel());
    const { map, gl } = fakeMapAndGl();
    layer.onAdd!(map, gl);
    await flushOnAdd();
    mocks.pendingLoads[0].onLoad({ scene: { children: [] } });

    layer.setVisible(false);
    layer.render(gl, IDENTITY_MAT4, FAKE_RENDER_OPTIONS);
    layer.setVisible(true);
    layer.render(gl, IDENTITY_MAT4, FAKE_RENDER_OPTIONS);

    expect(mocks.renderers[0].render).toHaveBeenCalledTimes(1);
  });

  it("setOpacity(0.5) after load stamps transparent:true/opacity:0.5 on every mesh material in the loaded scene graph", async () => {
    const layer = createModelLayer(makeModel());
    const { map, gl } = fakeMapAndGl();
    layer.onAdd!(map, gl);
    await flushOnAdd();

    const bodyMaterial = { transparent: false, opacity: 1 };
    const wingMaterial = { transparent: false, opacity: 1 };
    const fakeScene = {
      children: [
        { material: bodyMaterial, children: [] },
        { children: [{ material: wingMaterial, children: [] }] },
      ],
    };
    mocks.pendingLoads[0].onLoad({ scene: fakeScene });

    layer.setOpacity(0.5);

    expect(bodyMaterial).toEqual({ transparent: true, opacity: 0.5 });
    expect(wingMaterial).toEqual({ transparent: true, opacity: 0.5 });
  });

  it("setOpacity() called before the model has loaded is applied retroactively once it does", async () => {
    const layer = createModelLayer(makeModel());
    const { map, gl } = fakeMapAndGl();
    layer.onAdd!(map, gl);
    await flushOnAdd();

    layer.setOpacity(0.3); // called before the load resolves

    const material = { transparent: false, opacity: 1 };
    mocks.pendingLoads[0].onLoad({ scene: { material, children: [] } });

    expect(material).toEqual({ transparent: true, opacity: 0.3 });
  });

  it("onRemove() disposes the loaded scene graph's geometries/materials", async () => {
    const layer = createModelLayer(makeModel());
    const { map, gl } = fakeMapAndGl();
    layer.onAdd!(map, gl);
    await flushOnAdd();

    const disposeGeometry = vi.fn();
    const disposeMaterial = vi.fn();
    mocks.pendingLoads[0].onLoad({
      scene: { geometry: { dispose: disposeGeometry }, material: { dispose: disposeMaterial }, children: [] },
    });

    layer.onRemove!(map, gl);

    expect(disposeGeometry).toHaveBeenCalledTimes(1);
    expect(disposeMaterial).toHaveBeenCalledTimes(1);
  });
});
