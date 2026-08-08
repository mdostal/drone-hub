// Public export surface for the <LayerViewer> family. Import from
// "@/components/LayerViewer" (or copy this folder into a standalone
// consumer like personal-site — everything it transitively imports is
// scoped to this folder + lib/layer-types.ts, no app/ or gating deps).
//
// <LayerViewer> and <LayerControl> are independent sibling components (see
// LayerViewer.tsx's header comment for why); a consumer wires them together:
//
//   const viewerRef = useRef<LayerViewerHandle>(null);
//   const [layers, setLayers] = useState<LayerDef[]>([]);
//
//   <LayerViewer ref={viewerRef} manifest={manifest} onLayersChange={setLayers} />
//   <LayerControl
//     layers={layers}
//     onToggle={(id, toggle) => viewerRef.current?.toggleLayer(id, toggle)}
//     onOpacityChange={(id, opacity) => viewerRef.current?.setOpacity(id, opacity)}
//   />
//
// <LayerViewer> is a heavy client-only viewer (MapLibre touches `window`/
// canvas at construction) — mount it via next/dynamic({ ssr: false }),
// same convention as every other heavy viewer in this stack.
export { LayerViewer } from "./LayerViewer";
export type { LayerViewerProps, LayerViewerHandle } from "./LayerViewer";
export { LayerControl } from "./LayerControl";
export type { LayerControlProps } from "./LayerControl";

// Re-export the manifest types consumers need to build a PropertyLayers
// manifest or type these components' props, so importers don't also need
// to reach into lib/ directly (same precedent as VideoTour/index.ts).
export type { LayerDef, PropertyLayers } from "@/lib/layer-types";
