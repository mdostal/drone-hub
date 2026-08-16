"use client";

import { useMemo, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { Bounds, Instance, Instances, OrbitControls } from "@react-three/drei";
import type { VoxelGrid } from "@/lib/voxel-types";
import { BLOCK_SIZE, buildTerrainBlocks, type VoxelBlockInstance } from "./voxel-geometry";
import { cx } from "./cx";

/**
 * <VoxelTerrain> — the minecraft-content-engine epic's blocky terrain
 * renderer. Mirrors <Model3D>'s r3f/drei stack (Canvas + OrbitControls +
 * Bounds auto-framing, see components/Model3D/Model3D.tsx) rather than the
 * land-overlay epic's raw-three-in-MapLibre custom-layer approach — this is
 * a standalone 3D scene, no map to composite into.
 *
 * Renders a `VoxelGrid` (lib/voxel-types.ts) as a stack of colored cubes
 * per cell via `VoxelInstances`, which uses drei's `<Instances>`/
 * `<Instance>` wrapper around a single `THREE.InstancedMesh` — NOT one mesh
 * per cube. A 32x32 grid with height-stacking is several thousand cubes;
 * see voxel-geometry.ts's buildTerrainBlocks for the block-list math and
 * this file's VoxelInstances for the actual instanced draw call.
 *
 * `children` is rendered inside the SAME `<Canvas>`/`<Bounds>` as the
 * terrain — this is how <VoxelStructure> (VoxelStructure.tsx) composes in:
 * it's an r3f component that needs a live Canvas context, so it's meant to
 * be passed as a child here, e.g.
 * `<VoxelTerrain grid={grid}><VoxelStructure grid={grid} gridX={16} gridZ={16} /></VoxelTerrain>`,
 * not mounted on its own.
 *
 * SSR: same as <Model3D> — no server-only API is touched at module scope,
 * but this is still a heavy client-only WebGL viewer and should be mounted
 * via `next/dynamic(() => import(...), { ssr: false })` by any consumer.
 *
 * Controls legend: ships the same fixed-corner HTML legend panel
 * <Model3D> got in the brand-theming-and-viewer-polish epic (see
 * components/Model3D/Model3D.tsx's own legend doc comment) — same r3f/drei
 * stack, same "bare canvas with no UI chrome" gap, same fix. No Measure
 * toggle here (VoxelTerrain has no measure tool), so the panel is just a
 * static "Controls" header plus the orbit/zoom hints, styled identically
 * for cross-component consistency between /components/model3d and
 * /components/voxel-terrain.
 */
export interface VoxelTerrainProps {
  grid: VoxelGrid;
  /** Rendered inside the same <Canvas>/<Bounds> as the terrain — the slot
   *  <VoxelStructure> (or any other r3f content) composes into. */
  children?: ReactNode;
  className?: string;
}

/**
 * Shared instanced-cube renderer: turns a flat list of {position, color}
 * placements into ONE `THREE.InstancedMesh` draw call via drei's
 * `<Instances>`/`<Instance>`. Both <VoxelTerrain> (via TerrainBlocks below)
 * and <VoxelStructure> (VoxelStructure.tsx) render through this same
 * function — "reusing the SAME cube-instancing primitive," not a separate
 * rendering technique for the structure, per the story's design intent.
 * Not exported from index.ts (an internal primitive, not part of the
 * public component surface) but exported from this module so
 * VoxelStructure.tsx can import it directly.
 */
export function VoxelInstances({ blocks }: { blocks: VoxelBlockInstance[] }) {
  if (blocks.length === 0) return null;
  return (
    <Instances limit={blocks.length} range={blocks.length}>
      {/* Slightly smaller than a full BLOCK_SIZE cell so adjacent cubes
          show a hairline seam — reads as distinct blocks rather than one
          fused slab, part of the "genuinely blocky" look. */}
      <boxGeometry args={[BLOCK_SIZE * 0.96, BLOCK_SIZE * 0.96, BLOCK_SIZE * 0.96]} />
      <meshStandardMaterial />
      {blocks.map((block, i) => (
        // Index-keyed: this is a static, one-shot list built fresh per
        // grid/props change (see the useMemo below and in VoxelStructure),
        // never reordered in place.
        <Instance key={i} position={block.position} color={block.color} />
      ))}
    </Instances>
  );
}

function TerrainBlocks({ grid }: { grid: VoxelGrid }) {
  const blocks = useMemo(() => buildTerrainBlocks(grid), [grid]);
  // key={grid.slug}: forces a full remount of <VoxelInstances>'s underlying
  // <Instances> whenever the grid identity changes (e.g. a showcase page
  // switching between sample grids of different sizes/instance counts).
  // drei's <Instances> allocates its instance-matrix/color Float32Arrays
  // ONCE, sized to its `limit` prop, via a bare `useState(() => ...)`
  // initializer (node_modules/@react-three/drei/core/Instances.js) — it
  // does NOT reallocate when `limit` changes on a later render of the SAME
  // component instance. Without this key, switching from a smaller grid to
  // a larger one (more block instances than the first grid rendered) would
  // silently overflow that undersized buffer (WebGL
  // "bufferSubData: srcOffset + length too large" / "vertex buffer is not
  // big enough for the draw call", and a blank canvas) instead of drawing
  // the new terrain. Keying on the grid's own slug guarantees a fresh
  // <Instances> — and a correctly-sized buffer — every time the rendered
  // grid actually changes.
  return <VoxelInstances key={grid.slug} blocks={blocks} />;
}

export function VoxelTerrain({ grid, children, className }: VoxelTerrainProps) {
  // Bounds' fit/clip/observe (below) does the real auto-framing once
  // mounted; this initial camera position just needs to be roughly
  // proportional to the grid so the pre-fit frame isn't wildly off (same
  // reasoning as Model3D's fixed [3,3,3] start, scaled up since a voxel
  // grid is tens of world units across instead of ~1).
  const cameraDistance = Math.max(grid.size * 1.5, 10);

  return (
    <div className={cx("relative h-full w-full", className)} aria-label={grid.title}>
      <Canvas
        camera={{
          position: [cameraDistance, cameraDistance, cameraDistance],
          fov: 50,
          near: 0.1,
          far: cameraDistance * 20,
        }}
        gl={{ preserveDrawingBuffer: true }}
      >
        <ambientLight intensity={0.9} />
        <directionalLight position={[grid.size, grid.size * 2, grid.size]} intensity={1.2} />
        <directionalLight position={[-grid.size, -grid.size * 0.5, -grid.size]} intensity={0.35} />
        {/* fit/clip/observe/margin: same auto-framing convention as
            <Model3D> (components/Model3D/Model3D.tsx) — fits the camera to
            the rendered content's bounding box (terrain + any structure
            children) on mount, pushes near/far to avoid clipping, and
            re-fits if that content's bounds change later. */}
        <Bounds fit clip observe margin={1.2}>
          <TerrainBlocks grid={grid} />
          {children}
        </Bounds>
        {/* makeDefault: same reasoning as Model3D — registers this as the
            r3f store's active controls so <Bounds>'s auto-fit camera
            animation and OrbitControls cooperate instead of fighting. */}
        <OrbitControls makeDefault />
      </Canvas>

      {/* Controls legend — same fixed-corner HTML overlay panel/treatment as
          <Model3D>'s (components/Model3D/Model3D.tsx): absolutely positioned
          within this component's own container, themed via this repo's
          design tokens (bg-surface/border-border/text-foreground from
          app/globals.css). Outer layer is pointer-events-none so it only
          intercepts clicks over the panel itself, leaving the rest of the
          canvas free for orbit gestures. No Measure toggle — VoxelTerrain
          has no measure tool, so this is just the static orbit/zoom hints. */}
      <div className="pointer-events-none absolute inset-0">
        <div className="pointer-events-auto absolute top-3 right-3 flex w-56 flex-col gap-2 rounded-xl border border-border bg-surface/90 p-3 text-xs text-foreground shadow-lg backdrop-blur">
          <span className="font-medium">Controls</span>
          <ul className="flex flex-col gap-1 text-muted">
            <li>Drag to orbit</li>
            <li>Scroll to zoom</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
