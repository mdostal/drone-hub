// Public export surface for <VoxelTerrain> + <VoxelStructure>. Import from
// "@/components/VoxelTerrain" (or copy this folder into a standalone
// consumer like personal-site — everything it transitively imports is
// scoped to this folder + lib/voxel-types.ts, no app/ or gating deps, same
// precedent as components/Model3D/index.ts and components/LayerViewer/
// index.ts).
//
// Both are heavy client-only WebGL viewers (@react-three/fiber's <Canvas>
// touches `window`/canvas once mounted) — mount via
// next/dynamic({ ssr: false }), same convention as every other heavy viewer
// in this stack (<Model3D>, <LayerViewer>, <VideoTour>'s video element).
//
// `VoxelInstances` (the shared instanced-cube primitive both components
// render through) is deliberately NOT exported here — it's an internal
// rendering detail, not part of the public component surface, same as
// Model3D.tsx's toErrorMessage staying un-re-exported.
export { VoxelTerrain } from "./VoxelTerrain";
export type { VoxelTerrainProps } from "./VoxelTerrain";
export { VoxelStructure } from "./VoxelStructure";
export type { VoxelStructureProps } from "./VoxelStructure";
