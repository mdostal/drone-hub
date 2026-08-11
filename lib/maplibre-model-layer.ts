// MapLibre GL JS's documented "3D model via a custom layer" pattern — see
// .pHive/epics/land-overlay/docs/design-discussion.md for the full
// rationale and .pHive/epics/land-overlay/stories/land-overlay-model-layer.yaml
// for the 5 mandatory corrections an adversarial design review added to the
// naive happy-path recipe. This module owns ALL of it — deliberately NOT
// inlined into components/LayerViewer/LayerViewer.tsx (that file's whole
// design goal is pure, WebGL-free, unit-testable mapping functions; bolting
// a raw THREE.WebGLRenderer + onAdd/render/onRemove lifecycle in there would
// break that property and mix a third rendering paradigm into a file
// deliberately kept to one — see design-discussion.md §"Integration point").
//
// Raw three.js, NOT @react-three/fiber/drei: MapLibre hands this module its
// own WebGL context and calls onAdd/render/onRemove itself, once per map
// frame; r3f's <Canvas> assumes IT owns the render loop and context, which
// conflicts with rendering into MapLibre's existing loop. This is a
// genuinely different code path from components/Model3D/Model3D.tsx's r3f
// approach, not a style choice.
//
// TESTABILITY MAP (read this before adding tests — see
// maplibre-model-layer.test.ts):
//   - The matrix math (buildModelMatrix/combineMatrices/multiplyMat4/the
//     make*Mat4 helpers) is 100% pure array arithmetic — no three.js, no
//     maplibre-gl, no WebGL. Fully unit-tested.
//   - applyOpacityToSceneGraph/disposeSceneGraph are pure recursive
//     traversals typed against minimal STRUCTURAL shapes (Object3DLike /
//     DisposableObject3DLike), not THREE.Object3D itself — real
//     THREE.Group/Mesh/Material instances satisfy those shapes structurally
//     (that's what makes them safe to reuse unmocked inside
//     createModelLayer below), but the traversal logic itself can be
//     exercised with plain object literals, no three.js import needed.
//     Fully unit-tested.
//   - createModelLayer()'s onAdd/render/onRemove control flow (the
//     ready-guard, cancelled-guard, resetState-call, setVisible early
//     return) is tested by mocking the "three" and
//     "three/examples/jsm/loaders/GLTFLoader.js" module specifiers with
//     lightweight fakes that record calls instead of touching a real GL
//     context (jsdom has no WebGL — a real `new THREE.WebGLRenderer(...)`
//     throws the instant it tries to query the context). This proves the
//     WIRING (guards fire in the right order, resetState is actually
//     called, disposal walks the right objects) but NOT that the resulting
//     pixels are correct (right position/scale/perspective on screen,
//     correct behavior against MapLibre's ACTUAL raster/geojson layers
//     drawing after this one) — that needs a real WebGL context and is
//     Playwright's job, deferred to this epic's land-overlay-test-suite
//     story (see design-discussion.md's screen-space-centroid verification
//     method for what that story should check).

import type { CustomLayerInterface, Map as MapLibreMap } from "maplibre-gl";
import type { GeoAnchoredModel } from "./geo-model-types";

// ---------------------------------------------------------------------------
// Pure matrix math — no three.js, no maplibre-gl, no WebGL. See
// maplibre-model-layer.test.ts's "matrix math" describe block.
// ---------------------------------------------------------------------------

/**
 * A column-major 4x4 matrix as a flat 16-number array — the same element
 * layout MapLibre's `mat4` (gl-matrix) and three.js's `Matrix4#elements`
 * both use (the value at row r, column c lives at index `c * 4 + r`), so a
 * `Mat4` produced here can be hand off directly to
 * `THREE.Matrix4#fromArray` or treated as MapLibre's own `render(gl,
 * matrix)` parameter with no conversion.
 */
export type Mat4 = readonly number[];

export const IDENTITY_MAT4: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function makeTranslationMat4(x: number, y: number, z: number): Mat4 {
  // Mirrors THREE.Matrix4#makeTranslation's element layout exactly (verified
  // against node_modules/three/src/math/Matrix4.js) so the two produce
  // bit-identical matrices for the same inputs.
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
}

function makeScaleMat4(x: number, y: number, z: number): Mat4 {
  return [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1];
}

function makeRotationXMat4(theta: number): Mat4 {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
}

function makeRotationZMat4(theta: number): Mat4 {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/** Column-major 4x4 matrix multiply, `a * b` — matches
 *  `THREE.Matrix4#multiplyMatrices(a, b)` / `a.clone().multiply(b)`
 *  formula-for-formula (same source verified above), so a caller can freely
 *  mix `Mat4` values computed here with real `THREE.Matrix4#elements`
 *  arrays without any drift between the two. */
export function multiplyMat4(a: Mat4, b: Mat4): Mat4 {
  const out = new Array(16).fill(0) as number[];
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += a[k * 4 + row] * b[col * 4 + k];
      }
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

/** The subset of `maplibregl.MercatorCoordinate`'s instance shape this
 *  module needs — declared structurally (not imported from "maplibre-gl")
 *  so `buildModelMatrix` can be called with a plain object in tests without
 *  ever touching the real `maplibre-gl` module, which — like
 *  `components/LayerViewer/LayerViewer.tsx`'s `loadMapLibreModules` header
 *  comment explains — throws the instant it's imported under jsdom (no
 *  `Worker`/`URL.createObjectURL`). The real call site (createModelLayer's
 *  onAdd, below) passes an actual `MercatorCoordinate` instance, which
 *  satisfies this shape for free. */
export interface MercatorLike {
  x: number;
  y: number;
  z: number;
  meterInMercatorCoordinateUnits(): number;
}

/**
 * Pure: composes the model's object-space → Mercator-space transform —
 * translate to the anchor point, scale meters → Mercator units (the
 * `MercatorCoordinate.meterInMercatorCoordinateUnits()` factor × the
 * model's own optional `scale` multiplier), a fixed 90° X-axis rotation
 * (glTF's Y-up convention → Mercator's Z-up ground plane — this is NOT
 * configurable, every glTF needs it), and the model's optional yaw
 * (`rotationDegrees`, rotated about Z).
 *
 * Mirrors MapLibre/Mapbox's own official "3D model via custom layer"
 * example's `modelTransform` recipe exactly: `T · S · Rx · Rz` (applied
 * right-to-left to a vertex — Rz first, then Rx, then scale, then
 * translate), same as that example's
 * `new THREE.Matrix4().makeTranslation(...).scale(v).multiply(rotationX).multiply(rotationZ)`
 * chain. The Y scale is negated (`scale, -scale, scale`) as part of that
 * same official recipe's mercator/gl coordinate-handedness correction.
 *
 * `mercator` is injected rather than computed internally via
 * `maplibregl.MercatorCoordinate.fromLngLat` so this stays callable from a
 * unit test with a plain object (see MercatorLike above) — the real
 * createModelLayer call site (below) is the only place that actually
 * touches `maplibre-gl`.
 */
export function buildModelMatrix(model: GeoAnchoredModel, mercator: MercatorLike): Mat4 {
  const scale = (model.scale ?? 1) * mercator.meterInMercatorCoordinateUnits();
  const rotateZRadians = ((model.rotationDegrees ?? 0) * Math.PI) / 180;

  const translation = makeTranslationMat4(mercator.x, mercator.y, mercator.z);
  const scaling = makeScaleMat4(scale, -scale, scale);
  const rotationX = makeRotationXMat4(Math.PI / 2);
  const rotationZ = makeRotationZMat4(rotateZRadians);

  return multiplyMat4(multiplyMat4(multiplyMat4(translation, scaling), rotationX), rotationZ);
}

/** Pure: MapLibre's per-frame projection matrix × the model's own object
 *  transform — the exact composition `render()` (below) hands to the
 *  three.js camera every frame via `camera.projectionMatrix.fromArray(...)`.
 *  Factored out so the composition itself (not just its two inputs) is
 *  testable without a real `THREE.Camera`. */
export function combineMatrices(mapMatrix: Mat4, modelMatrix: Mat4): Mat4 {
  return multiplyMat4(mapMatrix, modelMatrix);
}

// ---------------------------------------------------------------------------
// Pure scene-graph traversal — structurally typed against a MINIMAL shape,
// not THREE.Object3D/THREE.Material, so these are testable with plain
// object literals. Real three.js instances satisfy these shapes for free
// (structural typing), which is what makes it safe to call them unmocked
// from createModelLayer's real onAdd/setOpacity/onRemove below. See
// maplibre-model-layer.test.ts's "scene graph traversal" describe block.
// ---------------------------------------------------------------------------

export interface MaterialLike {
  transparent: boolean;
  opacity: number;
}

export interface Object3DLike {
  material?: MaterialLike | MaterialLike[];
  children: Object3DLike[];
}

/**
 * Correction 6 (opacity): raw three.js has no single top-level "layer
 * opacity" the way MapLibre's `raster-opacity` paint property does — a
 * loaded glTF is a tree of meshes, each with its own material(s) (a mesh
 * can have one material or an array of them, e.g. per-submesh materials on
 * a multi-material export), so `setOpacity()` has to walk the whole scene
 * graph and stamp `transparent: true` + `opacity: value` onto every one of
 * them individually — `transparent` has to be set alongside `opacity`
 * because three.js materials don't blend translucently at all unless
 * `transparent` is true, regardless of the `opacity` value.
 */
export function applyOpacityToSceneGraph(root: Object3DLike, opacity: number): void {
  const materials = toMaterialArray(root.material);
  for (const material of materials) {
    material.transparent = true;
    material.opacity = opacity;
  }
  for (const child of root.children) {
    applyOpacityToSceneGraph(child, opacity);
  }
}

function toMaterialArray<M>(material: M | M[] | undefined): M[] {
  if (Array.isArray(material)) return material;
  if (material) return [material];
  return [];
}

export interface DisposableLike {
  dispose(): void;
}

export interface DisposableObject3DLike {
  geometry?: DisposableLike;
  material?: DisposableLike | DisposableLike[];
  children: DisposableObject3DLike[];
}

// Every texture-slot property name three.js's built-in material classes use
// across the Basic/Standard/Physical family (glTF materials export as one
// of these). three.js objects don't auto-garbage-collect GPU resources
// (buffers/textures/programs) when dereferenced — dispose() has to be
// called explicitly on every geometry/material/texture the loaded glTF
// created, or unmounting <LayerViewer> repeatedly leaks GPU memory.
const DISPOSABLE_TEXTURE_KEYS = [
  "map",
  "normalMap",
  "roughnessMap",
  "metalnessMap",
  "aoMap",
  "emissiveMap",
  "bumpMap",
  "displacementMap",
  "alphaMap",
  "envMap",
  "lightMap",
  "specularMap",
  "clearcoatMap",
  "clearcoatNormalMap",
  "clearcoatRoughnessMap",
  "sheenColorMap",
  "sheenRoughnessMap",
  "transmissionMap",
  "thicknessMap",
  "iridescenceMap",
] as const;

function isDisposable(value: unknown): value is DisposableLike {
  return (
    typeof value === "object" &&
    value !== null &&
    "dispose" in value &&
    typeof (value as DisposableLike).dispose === "function"
  );
}

/** Correction 5 (cleanup): disposes every geometry/material/texture in the
 *  given scene graph. Textures live as named properties ON a material
 *  (`material.map`, `material.normalMap`, ...) rather than in a
 *  traversable collection, so they're found by checking a fixed list of
 *  known texture-slot names (DISPOSABLE_TEXTURE_KEYS) rather than iterated
 *  generically. `material` is typed as just `{dispose(): void}`
 *  (DisposableLike) — not an indexable type — specifically so a real
 *  `THREE.Material` instance stays structurally assignable here without
 *  needing its own index signature; the texture lookup below reads via an
 *  internal `Record` cast instead of widening the public parameter type. */
export function disposeSceneGraph(root: DisposableObject3DLike): void {
  root.geometry?.dispose();
  for (const material of toMaterialArray(root.material)) {
    const record = material as unknown as Record<string, unknown>;
    for (const key of DISPOSABLE_TEXTURE_KEYS) {
      const texture = record[key];
      if (isDisposable(texture)) texture.dispose();
    }
    material.dispose();
  }
  for (const child of root.children) {
    disposeSceneGraph(child);
  }
}

// ---------------------------------------------------------------------------
// The real thing: createModelLayer(). Everything below this line touches
// three.js/maplibre-gl/WebGL and is NOT unit-tested directly — it's tested
// by mocking the "three"/GLTFLoader module specifiers (see
// maplibre-model-layer.test.ts's "createModelLayer" describe block) to
// prove the control flow, with real-pixel verification deferred to
// Playwright (land-overlay-test-suite). See the TESTABILITY MAP comment at
// the top of this file.
// ---------------------------------------------------------------------------

// Lazy-loaded exactly like components/LayerViewer/LayerViewer.tsx's
// `loadMapLibreModules` — same reasoning: `maplibre-gl` touches browser-only
// globals (`Worker`, `URL.createObjectURL`) as a *module-load-time* side
// effect, which crashes `next build`'s server-side prerendering pass the
// moment this module is statically imported from anywhere. Bundled with
// `three`/`GLTFLoader` in the same lazy Promise.all so onAdd (below) has a
// single await point, and so this module never eagerly touches any
// browser-only API at import time either — it can be statically imported
// from a server component without crashing, exactly like LayerViewer.tsx.
let renderingModulesPromise: Promise<{
  THREE: typeof import("three");
  GLTFLoader: typeof import("three/examples/jsm/loaders/GLTFLoader.js").GLTFLoader;
  DRACOLoader: typeof import("three/examples/jsm/loaders/DRACOLoader.js").DRACOLoader;
  MercatorCoordinate: typeof import("maplibre-gl").MercatorCoordinate;
}> | null = null;

// Same public decoder CDN @react-three/drei's `useGLTF` defaults to
// (node_modules/@react-three/drei/core/Gltf.js) -- <Model3D> gets Draco
// support for free through drei; this hand-rolled GLTFLoader doesn't, so it
// needs the same DRACOLoader wiring drei does under the hood. Matching
// drei's default keeps behavior identical between the two loading paths
// rather than introducing a second, differently-versioned decoder.
export const DRACO_DECODER_PATH = "https://www.gstatic.com/draco/versioned/decoders/1.5.5/";

function loadRenderingModules() {
  if (!renderingModulesPromise) {
    renderingModulesPromise = Promise.all([
      import("three"),
      import("three/examples/jsm/loaders/GLTFLoader.js"),
      import("three/examples/jsm/loaders/DRACOLoader.js"),
      import("maplibre-gl"),
    ]).then(([THREE, { GLTFLoader }, { DRACOLoader }, maplibregl]) => ({
      THREE,
      GLTFLoader,
      DRACOLoader,
      MercatorCoordinate: maplibregl.MercatorCoordinate,
    }));
  }
  return renderingModulesPromise;
}

export interface ModelLayer extends CustomLayerInterface {
  /** Correction 6: sets `transparent`/`opacity` across every material in
   *  the loaded glTF's scene graph (0–1). Safe to call before the model has
   *  finished loading — the value is cached and applied retroactively the
   *  moment it does. */
  setOpacity(opacity: number): void;
  /** Toggle visibility. `render()` early-returns without drawing when
   *  false — cheaper than repeatedly `map.removeLayer()`/`addLayer()`-ing
   *  this layer and avoids re-triggering the glTF load every time the
   *  model is hidden/shown again. */
  setVisible(visible: boolean): void;
  /** True once the glTF has finished loading AND been added to the scene
   *  (Correction 1's ready-guard, read externally) — i.e. once `render()`
   *  will actually draw something on the next frame MapLibre calls it,
   *  rather than early-returning. Exposed so a consumer/test can wait
   *  deterministically for "the model has rendered at least one real
   *  frame" (reachable via `map.getLayer(id).implementation.isReady()`)
   *  instead of guessing with a fixed timeout — land-overlay-test-suite's
   *  numeric placement checks need exactly this to avoid a flaky race
   *  against the async glTF fetch/parse. */
  isReady(): boolean;
}

/**
 * MapLibre GL JS's documented "3D model via a custom layer" pattern:
 * returns a `CustomLayerInterface` (+ the `setOpacity`/`setVisible` extras
 * above) that draws `model`'s glTF, anchored at its real lat/lon, into
 * MapLibre's own WebGL context/render loop via a raw `THREE.WebGLRenderer`.
 * A consumer wires it in exactly like
 * `@geomatico/maplibre-cog-protocol` is already wired into
 * LayerViewer.tsx — `map.addLayer(createModelLayer(model))` /
 * `map.removeLayer(model.id)` — not reimplemented inline.
 */
export function createModelLayer(model: GeoAnchoredModel): ModelLayer {
  type THREEModule = typeof import("three");
  type GLTF = import("three/examples/jsm/loaders/GLTFLoader.js").GLTF;

  let renderer: InstanceType<THREEModule["WebGLRenderer"]> | null = null;
  let scene: InstanceType<THREEModule["Scene"]> | null = null;
  let camera: InstanceType<THREEModule["Camera"]> | null = null;
  let modelRoot: GLTF["scene"] | null = null;
  let modelMatrix: Mat4 | null = null;

  // Correction 1 (ready-guard): false until the glTF has actually loaded
  // AND been added to the scene. onAdd is called synchronously by MapLibre,
  // but loading `three`/`GLTFLoader` and fetching/parsing the glTF are both
  // async — render() can (and, on a real map, WILL) fire before any of that
  // finishes without this guard.
  let ready = false;
  // Correction 2 (cancelled-guard): flips true the instant onRemove() fires.
  // Checked both before the lazy module import resolves and — the case
  // that actually matters — before the in-flight GLTFLoader.load() callback
  // calls scene.add(), so a load that resolves after unmount can't add
  // anything to a scene nobody will ever render or clean up again. Mirrors
  // LayerViewer.tsx's manifest-resolution effect's own `cancelled` flag.
  let cancelled = false;
  let visible = true;
  // Holds the DRACOLoader instance so onRemove() can dispose it -- DRACOLoader
  // spins up a real Web Worker pool for decoding; leaving it running after
  // the layer is torn down leaks workers.
  let dracoLoader: InstanceType<
    typeof import("three/examples/jsm/loaders/DRACOLoader.js").DRACOLoader
  > | null = null;
  // setOpacity() may be called (e.g. by a consumer syncing initial props)
  // before the glTF has loaded and modelRoot exists yet; remembered here and
  // applied once the load callback actually adds the scene graph.
  let pendingOpacity: number | null = null;

  return {
    id: model.id,
    type: "custom",
    renderingMode: "3d",

    onAdd(map: MapLibreMap, gl: WebGLRenderingContext | WebGL2RenderingContext) {
      loadRenderingModules().then(({ THREE, GLTFLoader, DRACOLoader, MercatorCoordinate }) => {
        // onRemove() already fired while the lazy import was in flight
        // (mount torn down before three.js even finished loading) — don't
        // spin up a renderer/scene nobody will ever clean up.
        if (cancelled) return;

        scene = new THREE.Scene();
        // glTF PBR materials (MeshStandardMaterial/MeshPhysicalMaterial,
        // what most exported models use, including the sample duck) render
        // solid black with zero lights in the scene — found during this
        // epic's showcase-page live verification (the duck rendered as a
        // black silhouette; positioning/scale were correct, only lighting
        // was missing). A basic two-light rig (ambient so nothing is ever
        // fully unlit + one directional for actual shading/depth cues) is
        // enough for a model viewed from a map's typical oblique angle.
        scene.add(new THREE.AmbientLight(0xffffff, 1.2));
        const sun = new THREE.DirectionalLight(0xffffff, 2.5);
        sun.position.set(0, -70, 100); // roughly overhead, matching a map's default top-down-ish view
        scene.add(sun);
        // Constructor params barely matter: `projectionMatrix` gets fully
        // overwritten every frame in render() below from MapLibre's own
        // camera matrix, so this never uses its own default projection.
        camera = new THREE.Camera();
        renderer = new THREE.WebGLRenderer({
          canvas: map.getCanvas(),
          // three's own WebGLRendererParameters#context types narrower
          // (WebGLRenderingContext only) than MapLibre's `gl` param
          // (WebGLRenderingContext | WebGL2RenderingContext) — a real
          // WebGL2RenderingContext works fine here (this is the exact
          // context-sharing MapLibre/three integration MapLibre's own
          // official custom-layer example uses); the cast only bridges the
          // two libraries' independently-narrower TS types, not a runtime
          // concern.
          context: gl as WebGLRenderingContext,
          antialias: true,
        });
        // Don't let three.js clear MapLibre's already-drawn framebuffer
        // (basemap + raster/geojson layers drawn before this custom layer)
        // before drawing the model into it.
        renderer.autoClear = false;

        const mercator = MercatorCoordinate.fromLngLat(
          { lng: model.lon, lat: model.lat },
          model.altitudeMeters ?? 0,
        );
        modelMatrix = buildModelMatrix(model, mercator);

        // Without this, GLTFLoader.parse() throws "No DRACOLoader instance
        // provided" the moment it hits a Draco-compressed mesh (confirmed
        // live against the real, Draco-compressed 2806 Prado reconstruction
        // -- <Model3D> loads the identical file fine because drei's
        // `useGLTF` wires this up automatically; this hand-rolled loader
        // didn't).
        dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath(DRACO_DECODER_PATH);
        const loader = new GLTFLoader();
        loader.setDRACOLoader(dracoLoader);
        loader.load(
          model.url,
          (gltf) => {
            // Correction 2, the actual case it exists for: onRemove() fired
            // while this fetch/parse was in flight. Do NOT add anything to
            // a scene that no longer exists in any meaningful sense (it's
            // been dereferenced by onRemove, but this closure still holds
            // it — adding to it would leak the whole loaded scene graph
            // with nothing left to ever dispose it).
            if (cancelled) return;
            modelRoot = gltf.scene;
            if (pendingOpacity !== null) {
              applyOpacityToSceneGraph(modelRoot, pendingOpacity);
            }
            scene?.add(modelRoot);
            ready = true;
          },
          undefined,
          (error) => {
            console.error(
              `[maplibre-model-layer] failed to load "${model.url}" for model "${model.id}"`,
              error,
            );
          },
        );
      });
    },

    // `matrix`'s type is intentionally left to be inferred contextually
    // (as `mat4`, from this object literal's `: ModelLayer` / extends
    // `CustomLayerInterface` context) rather than annotated explicitly —
    // `mat4` (gl-matrix) isn't part of maplibre-gl's public type exports,
    // so it can't be named directly here; any explicit stand-in type
    // (`number[] | Float32Array`) is narrower than the real union (`mat4`
    // also permits any generic indexed/iterable collection) and fails
    // TypeScript's contravariant parameter check.
    render(gl, matrix) {
      // Correction 1: the ready-guard. Checked FIRST, before touching
      // anything else — no partial/undefined-state render is possible.
      if (!ready) return;
      // Visibility toggle: early-return without drawing, cheaper than
      // add/removing the MapLibre layer (see ModelLayer#setVisible above).
      if (!visible) return;
      // Defensive only — if `ready` is true these are always set (both flip
      // in the same load callback), but keeps this function's own types
      // narrow without a non-null assertion.
      if (!renderer || !scene || !camera || !modelMatrix) return;

      const combined = combineMatrices(Array.from(matrix), modelMatrix);
      camera.projectionMatrix.fromArray(combined);
      renderer.render(scene, camera);
      // Correction 4: three.js's WebGLRenderer mutates GL state
      // (depth/blend/cull/viewport) as a side effect of render() — without
      // resetting it here, MapLibre's OWN subsequent layer draws (the
      // ortho/hillshade/parcel-boundary raster/geojson layers) can render
      // corrupted immediately after this custom layer's frame. Must run
      // AFTER render(), before returning control to MapLibre.
      renderer.resetState();
    },

    onRemove() {
      // Flips first: blocks both the lazy-module-load continuation above
      // (if still in flight) and the GLTFLoader.load() callback (if still
      // in flight) from doing anything further.
      cancelled = true;
      ready = false;
      // Correction 5: dispose every geometry/material/texture the loaded
      // glTF created — three.js objects don't auto-garbage-collect GPU
      // resources just because this closure drops its references below.
      if (modelRoot) {
        disposeSceneGraph(modelRoot);
        scene?.remove(modelRoot);
      }
      modelRoot = null;
      scene = null;
      camera = null;
      renderer = null;
      modelMatrix = null;
      // Terminates DRACOLoader's decode worker pool -- same reasoning as
      // Correction 5 above, just for the loader's own resources rather than
      // the loaded scene graph's.
      dracoLoader?.dispose();
      dracoLoader = null;
    },

    setOpacity(opacity: number) {
      pendingOpacity = opacity;
      if (modelRoot) applyOpacityToSceneGraph(modelRoot, opacity);
    },

    setVisible(value: boolean) {
      visible = value;
    },

    isReady() {
      return ready;
    },
  };
}
