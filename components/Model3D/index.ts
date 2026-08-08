// Public export surface for <Model3D>. Import from "@/components/Model3D"
// (or copy this folder into a standalone consumer like personal-site —
// everything it transitively imports is scoped to this folder, no app/ or
// gating deps, same precedent as components/LayerViewer/index.ts and
// components/VideoTour/index.ts).
//
// <Model3D> is a heavy client-only viewer (WebGL canvas via
// @react-three/fiber, touches `window`/canvas once mounted) — mount it via
// next/dynamic({ ssr: false }), same convention as every other heavy viewer
// in this stack (<LayerViewer>, <VideoTour>'s video element).
export { Model3D } from "./Model3D";
export type { Model3DProps, ModelDef } from "./Model3D";
