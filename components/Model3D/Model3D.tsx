"use client";

import { Component, Suspense, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { Bounds, OrbitControls, useGLTF } from "@react-three/drei";
import { cx } from "./cx";

/**
 * <Model3D> — CBA's Phase-3 `Model3DViewer`: a `@react-three/fiber` glTF
 * mesh viewer. Loads a single glb/gltf via drei's `useGLTF`, orbits it with
 * drei's `<OrbitControls>`, and auto-frames it with drei's `<Bounds>` so an
 * arbitrary model (unknown scale/units/origin) isn't tiny/huge/off-center by
 * default — the acceptance criteria's "reasonably framed" requirement.
 *
 * DELIBERATELY MINIMAL PROPS (per this story's do_not list / the model3d
 * epic's design discussion): `ModelDef` is just `{id, url, title}` — no
 * scale/position/geo-anchoring fields. Those are deferred to the future
 * land-overlay epic's own type once it's known whether that epic wants
 * scene-space transforms (place this mesh at some offset within one
 * <Canvas>) or geo-space anchoring (lat/lon/alt draped onto <LayerViewer>'s
 * map) — guessing that shape now risks locking in the wrong one.
 *
 * SSR: no server-only APIs are touched at module scope — `@react-three/
 * fiber`'s <Canvas> and `@react-three/drei`'s hooks/components only touch
 * `window`/WebGL once actually rendered (mounted), not on import — but this
 * is still a heavy client-only viewer (WebGL canvas, texture/geometry
 * decoding) and should be mounted the same way every other heavy viewer in
 * this stack is: `next/dynamic(() => import(...), { ssr: false })`.
 */

/** Minimal, deliberately narrow model manifest entry — see the do_not list:
 *  no scale/position/geo-anchoring fields in this epic. */
export interface ModelDef {
  id: string;
  url: string;
  title: string;
}

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
function GltfScene({ url }: { url: string }) {
  const gltf = useGLTF(url);
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
                breathing room around the mesh rather than a tight crop. */}
            <Bounds fit clip observe margin={1.2}>
              <GltfScene url={model.url} />
            </Bounds>
          </Suspense>
        </ModelErrorBoundary>
        {/* makeDefault registers this as the r3f store's active controls
            instance, which is what <Bounds>'s internal moveTo/lookAt camera
            animation (driven through useThree().controls) targets — without
            it, Bounds' auto-fit and OrbitControls silently fight over the
            camera instead of cooperating. */}
        <OrbitControls makeDefault />
      </Canvas>
    </div>
  );
}
