"use client";

import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Bounds, Html, Line, OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { cx } from "./cx";

/**
 * <Model3D> — CBA's Phase-3 `Model3DViewer`: a `@react-three/fiber` glTF
 * mesh viewer. Loads a single glb/gltf via drei's `useGLTF`, orbits it with
 * drei's `<OrbitControls>`, and auto-frames it with drei's `<Bounds>` so an
 * arbitrary model (unknown scale/units/origin) isn't tiny/huge/off-center by
 * default — the acceptance criteria's "reasonably framed" requirement. Also
 * ships a real measure tool (click two points on the mesh, see the distance)
 * and an on-canvas controls legend — see the brand-theming-and-viewer-polish
 * epic's model3d-measure-tool-and-legend story / design-discussion.md §3c.
 *
 * DELIBERATELY MINIMAL PROPS (per the original model3d epic's do_not list):
 * `ModelDef` is `{id, url, title}` plus one narrow, additive exception —
 * `unitsPerMeter` (see its own doc comment) — for the measure tool's
 * distance label. Still no scale/position/geo-anchoring *transform* fields;
 * those stay deferred to the land-overlay epic's own type, per the original
 * rationale below.
 *
 * SSR: no server-only APIs are touched at module scope — `@react-three/
 * fiber`'s <Canvas> and `@react-three/drei`'s hooks/components only touch
 * `window`/WebGL once actually rendered (mounted), not on import — but this
 * is still a heavy client-only viewer (WebGL canvas, texture/geometry
 * decoding) and should be mounted the same way every other heavy viewer in
 * this stack is: `next/dynamic(() => import(...), { ssr: false })`.
 */

/** Minimal, deliberately narrow model manifest entry — see the do_not list:
 *  no scale/position/geo-anchoring *transform* fields in this epic. */
export interface ModelDef {
  id: string;
  url: string;
  title: string;
  /** How many raw glTF units equal one real-world meter, for the measure
   *  tool's distance label. Optional and absent by default (including for
   *  the sample duck) — there is no known real-world scale for it, or for
   *  <Model3D> in general, until a real photogrammetry pipeline supplies
   *  one. When absent, distances stay labeled in raw "units"; a future
   *  real-data caller can opt into a "X.XX m" label by setting this. */
  unitsPerMeter?: number;
}

/** Accent color for measure-mode markers/line/label — this epic's design
 *  token (app/globals.css's --color-accent, #e8590c). Hardcoded rather than
 *  read from CSS because these are three.js material colors, not DOM/
 *  Tailwind classes — three.js has no notion of a CSS custom property. Keep
 *  in sync with --color-accent if that token's value ever changes. */
const MEASURE_ACCENT_COLOR = "#e8590c";

/** A pointer gesture only counts as a measure-point "click" if it moves
 *  less than this many screen pixels between pointerdown and pointerup...
 *  see MeasureController's doc comment for the full rationale. */
const CLICK_MAX_MOVEMENT_PX = 6;
/** ...and completes within this many milliseconds — otherwise it's treated
 *  as a drag-to-orbit gesture (or a long press) and ignored for measuring. */
const CLICK_MAX_DURATION_MS = 500;

export interface Model3DProps {
  model: ModelDef;
  /** Fired if the glTF fails to load (bad url, network error, parse error). */
  onLoadError?: (message: string) => void;
  className?: string;
}

/** The actual mesh, loaded via drei's `useGLTF` (Suspense-driven — throws a
 *  promise while loading, which the <Suspense> boundary below catches).
 *  Rendered as a `<primitive>` wrapping the parsed scene graph rather than
 *  picking out individual meshes, so this works for arbitrary glTFs (single
 *  mesh or multi-node hierarchy) without assuming a shape. */
function GltfScene({
  url,
  onSceneReady,
}: {
  url: string;
  /** Reports the loaded scene graph's root object up to <Model3D>, so the
   *  measure tool's raycaster (which lives outside <Bounds>, see
   *  MeasureController) has something to intersect against. */
  onSceneReady?: (scene: THREE.Object3D) => void;
}) {
  const gltf = useGLTF(url);
  useEffect(() => {
    onSceneReady?.(gltf.scene);
  }, [gltf.scene, onSceneReady]);
  return <primitive object={gltf.scene} />;
}

/** Loading-state placeholder shown inside the canvas while the glTF fetch/
 *  decode is in flight (the <Suspense> fallback). A plain mesh, not DOM —
 *  DOM can't be rendered inside a `<Canvas>`'s r3f tree. */
function LoadingPlaceholder() {
  return (
    <mesh>
      <boxGeometry args={[0.4, 0.4, 0.4]} />
      <meshBasicMaterial color="#94a3b8" wireframe />
    </mesh>
  );
}

/** Normalizes whatever an error boundary catches (an `Error`, or anything
 *  else JS lets you `throw`) into a display/report-able string. The one
 *  bit of pure, WebGL-independent logic in this file — everything else
 *  below is JSX composition of Canvas/useGLTF/Bounds/OrbitControls, which
 *  genuinely needs a real WebGL context to exercise. Exported for
 *  Model3D.test.tsx; not part of the component's public API (not
 *  re-exported from index.ts). */
export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A bare {x,y,z} point — deliberately not typed as THREE.Vector3 so this
 *  function (and its unit test) has no three.js/WebGL dependency, matching
 *  this repo's precedent (components/LayerViewer/LayerViewer.tsx's
 *  resolveManifest/buildLayerMapConfig) of pulling pure logic out of
 *  WebGL-only components specifically for jsdom-testability. A real
 *  THREE.Vector3 is structurally compatible (it has x/y/z own properties),
 *  so the component below passes real Vector3 instances into this directly
 *  with no conversion. */
export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/** Euclidean distance between two points, in whatever unit the inputs are
 *  already in (raw glTF units, for the measure tool). Pure and
 *  WebGL-independent — see Model3D.test.tsx for direct unit coverage. Not
 *  part of <Model3D>'s public API (not re-exported from index.ts), same
 *  precedent as `toErrorMessage` above. */
export function distanceBetweenPoints(a: Point3, b: Point3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Formats a raw glTF-unit distance for the measure tool's floating label.
 *  Honestly labeled "units" (not "meters") unless the caller's `ModelDef`
 *  supplies `unitsPerMeter` — see `ModelDef.unitsPerMeter`'s doc comment
 *  for the full rationale (no fabricated real-world precision for the
 *  sample duck, or for <Model3D> in general, until a real photogrammetry
 *  pipeline supplies a known scale). */
export function formatDistance(rawDistance: number, unitsPerMeter?: number): string {
  if (unitsPerMeter && unitsPerMeter > 0) {
    return `${(rawDistance / unitsPerMeter).toFixed(2)} m`;
  }
  return `${rawDistance.toFixed(2)} units`;
}

/** Renders nothing visible — a <Canvas>-level controller that raycasts
 *  genuine clicks (not drags) against the loaded glTF scene while measure
 *  mode is active, and reports the hit point up to <Model3D>'s state.
 *
 *  Listens on the canvas DOM element directly (native pointerdown/pointerup,
 *  not r3f's per-object synthetic pointer events) so the click-vs-drag
 *  threshold is measured in real screen pixels regardless of exactly what
 *  the pointer started over, and — critically — it never calls
 *  stopPropagation/preventDefault, so OrbitControls' own native drag
 *  listeners on that same canvas element are completely unaffected. This is
 *  what keeps "measure mode on" from regressing orbit-drag: dragging still
 *  orbits, only a genuine click places a point. */
function MeasureController({
  active,
  targetRef,
  onPlacePoint,
}: {
  active: boolean;
  targetRef: RefObject<THREE.Object3D | null>;
  onPlacePoint: (point: THREE.Vector3) => void;
}) {
  const { camera, gl, raycaster } = useThree();
  const pointerDownRef = useRef<{ x: number; y: number; time: number } | null>(null);

  useEffect(() => {
    const canvasEl = gl.domElement;

    function handlePointerDown(event: PointerEvent) {
      pointerDownRef.current = { x: event.clientX, y: event.clientY, time: performance.now() };
    }

    function handlePointerUp(event: PointerEvent) {
      const down = pointerDownRef.current;
      pointerDownRef.current = null;
      // Always tracked above (regardless of `active`) so toggling measure
      // mode mid-gesture can't leave stale state — but placement itself is
      // gated on `active` here.
      if (!active || !down) return;

      const movedPx = Math.hypot(event.clientX - down.x, event.clientY - down.y);
      const elapsedMs = performance.now() - down.time;
      // Not a genuine click — a drag-to-orbit gesture (or a long press).
      // Ignore it for measuring.
      if (movedPx > CLICK_MAX_MOVEMENT_PX || elapsedMs > CLICK_MAX_DURATION_MS) return;

      const target = targetRef.current;
      if (!target) return;

      const rect = canvasEl.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObject(target, true);
      if (hits.length > 0) {
        onPlacePoint(hits[0].point.clone());
      }
    }

    canvasEl.addEventListener("pointerdown", handlePointerDown);
    canvasEl.addEventListener("pointerup", handlePointerUp);
    return () => {
      canvasEl.removeEventListener("pointerdown", handlePointerDown);
      canvasEl.removeEventListener("pointerup", handlePointerUp);
    };
  }, [active, camera, gl, raycaster, targetRef, onPlacePoint]);

  return null;
}

/** Renders the placed measure-point markers, their connecting line, and the
 *  floating distance label.
 *
 *  Deliberately mounted as a <Canvas>-level SIBLING of <Bounds> in
 *  <Model3D> below — never as its child. This is the story's critical,
 *  grill-flagged constraint: `<Bounds fit clip observe margin={1.2}>`
 *  recomputes the camera fit from the bounding box of everything it wraps,
 *  so measure geometry placed *inside* it would grow that box with every
 *  new point and risk an unwanted camera re-frame/zoom mid-measurement.
 *  `<Bounds>`'s own wrapping `<group>` applies no transform of its own
 *  (confirmed by reading node_modules/@react-three/drei/core/Bounds.js —
 *  it only moves the camera, never repositions its children), so world-space
 *  points captured by raycasting the mesh *inside* `<Bounds>` still line up
 *  correctly with markers rendered *outside* it — no coordinate conversion
 *  needed between the two. */
function MeasureOverlay({
  points,
  markerRadius,
  unitsPerMeter,
}: {
  points: THREE.Vector3[];
  markerRadius: number;
  unitsPerMeter?: number;
}) {
  return (
    <>
      {points.map((point, index) => (
        <mesh key={index} position={point}>
          <sphereGeometry args={[markerRadius, 16, 16]} />
          <meshBasicMaterial color={MEASURE_ACCENT_COLOR} />
        </mesh>
      ))}
      {points.length === 2 && (
        <>
          <Line points={[points[0], points[1]]} color={MEASURE_ACCENT_COLOR} lineWidth={2} />
          <Html position={points[0].clone().add(points[1]).multiplyScalar(0.5)} center>
            <div className="pointer-events-none rounded-md border border-border bg-surface/90 px-2 py-1 text-xs font-medium whitespace-nowrap text-accent shadow-lg">
              {formatDistance(distanceBetweenPoints(points[0], points[1]), unitsPerMeter)}
            </div>
          </Html>
        </>
      )}
    </>
  );
}

/** Catches glTF load/parse failures (bad url, 404, malformed file) that
 *  `useGLTF`'s Suspense-throw doesn't cover — Suspense only handles the
 *  pending-promise case, not the rejected one. Without this, a bad url
 *  would unmount the whole viewer with an uncaught error instead of a
 *  contained, reportable failure. Class component because error boundaries
 *  have no hook equivalent. */
class ModelErrorBoundary extends Component<
  { onError?: (message: string) => void; children: ReactNode },
  { message: string | null }
> {
  state = { message: null as string | null };

  static getDerivedStateFromError(error: unknown) {
    return { message: toErrorMessage(error) };
  }

  componentDidCatch(error: unknown) {
    this.props.onError?.(toErrorMessage(error));
  }

  render() {
    if (this.state.message) return null;
    return this.props.children;
  }
}

export function Model3D({ model, onLoadError, className }: Model3DProps) {
  const sceneRef = useRef<THREE.Object3D | null>(null);
  const [measureMode, setMeasureMode] = useState(false);
  const [points, setPoints] = useState<THREE.Vector3[]>([]);
  const [markerRadius, setMarkerRadius] = useState(0.02);

  const handleSceneReady = useCallback((scene: THREE.Object3D) => {
    sceneRef.current = scene;
    // Scale the marker size to the loaded model's own bounding-box
    // diagonal so it reads sensibly whether the glTF is duck-scale (tens
    // of units) or a future real photogrammetry mesh at a totally
    // different scale — a fixed radius would be invisible on one and
    // comically large on the other.
    const box = new THREE.Box3().setFromObject(scene);
    const diagonal = box.isEmpty() ? 0 : box.getSize(new THREE.Vector3()).length();
    setMarkerRadius(diagonal > 0 ? diagonal * 0.01 : 0.02);
  }, []);

  const handlePlacePoint = useCallback((point: THREE.Vector3) => {
    // Two points placed: draw the segment + label (MeasureOverlay above).
    // A third click (this branch, once `prev.length` is already 2) clears
    // the old measurement and starts a fresh one at the new point, per this
    // story's chosen Clear behavior (documented on the "Clear measurement"
    // button below too, which does the same reset explicitly/on demand).
    setPoints((prev) => (prev.length >= 2 ? [point] : [...prev, point]));
  }, []);

  const handleToggleMeasure = useCallback(() => {
    setMeasureMode((prev) => !prev);
  }, []);

  const handleClearMeasurement = useCallback(() => setPoints([]), []);

  return (
    <div className={cx("relative h-full w-full", className)} aria-label={model.title}>
      <Canvas camera={{ position: [3, 3, 3], fov: 50, near: 0.01, far: 1000 }}>
        <ambientLight intensity={0.9} />
        <directionalLight position={[5, 10, 7]} intensity={1.2} />
        <directionalLight position={[-5, -3, -5]} intensity={0.4} />
        <ModelErrorBoundary onError={onLoadError}>
          <Suspense fallback={<LoadingPlaceholder />}>
            {/* fit: auto-fit the camera to the mesh's bounding box on mount.
                clip: push the camera's near/far planes to the mesh's bounds
                so it isn't clipped. observe: re-fit if the mesh's own bounds
                change later (e.g. a swapped `model.url`). margin: a little
                breathing room around the mesh rather than a tight crop.
                Measure geometry deliberately does NOT live inside here —
                see MeasureOverlay's doc comment. */}
            <Bounds fit clip observe margin={1.2}>
              <GltfScene url={model.url} onSceneReady={handleSceneReady} />
            </Bounds>
          </Suspense>
        </ModelErrorBoundary>
        {/* makeDefault registers this as the r3f store's active controls
            instance, which is what <Bounds>'s internal moveTo/lookAt camera
            animation (driven through useThree().controls) targets — without
            it, Bounds' auto-fit and OrbitControls silently fight over the
            camera instead of cooperating. */}
        <OrbitControls makeDefault />
        {/* <Canvas>-level siblings of <Bounds>, not children of it — see
            MeasureController's/MeasureOverlay's own doc comments for why. */}
        <MeasureController active={measureMode} targetRef={sceneRef} onPlacePoint={handlePlacePoint} />
        <MeasureOverlay points={points} markerRadius={markerRadius} unitsPerMeter={model.unitsPerMeter} />
      </Canvas>

      {/* Controls legend — a small fixed-corner HTML panel absolutely
          positioned within this component's own container (not a separate
          page element), themed via this epic's design tokens
          (bg-surface/border-border/text-foreground/text-accent from
          app/globals.css). Outer layer is pointer-events-none so it only
          intercepts clicks over the panel itself, leaving the rest of the
          canvas free for orbit/measure clicks. */}
      <div className="pointer-events-none absolute inset-0">
        <div className="pointer-events-auto absolute top-3 right-3 flex w-56 flex-col gap-2 rounded-xl border border-border bg-surface/90 p-3 text-xs text-foreground shadow-lg backdrop-blur">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">Controls</span>
            <button
              type="button"
              onClick={handleToggleMeasure}
              aria-pressed={measureMode}
              className={cx(
                "rounded-full border px-2 py-1 text-[11px] font-medium transition-colors",
                measureMode
                  ? "border-accent bg-accent text-white"
                  : "border-border text-foreground hover:border-accent hover:text-accent",
              )}
            >
              {measureMode ? "Measure: On" : "Measure"}
            </button>
          </div>
          <ul className="flex flex-col gap-1 text-muted">
            <li>Drag to orbit</li>
            <li>Scroll to zoom</li>
            {measureMode ? (
              <>
                <li className="text-accent">Click two points to measure</li>
                <li>
                  <button
                    type="button"
                    onClick={handleClearMeasurement}
                    disabled={points.length === 0}
                    className="text-foreground underline decoration-dotted underline-offset-2 disabled:cursor-not-allowed disabled:text-muted disabled:no-underline"
                  >
                    Clear measurement
                  </button>
                </li>
              </>
            ) : (
              <li>Toggle Measure to place points</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
