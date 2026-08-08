# Horizontal Plan — 3D-model-on-land overlay

1. **The custom-layer engine** — `lib/geo-model-types.ts` (GeoAnchoredModel)
   + `lib/maplibre-model-layer.ts` (the CustomLayerInterface factory: async
   three.js/GLTFLoader loading with a ready-guard, camera-matrix sync,
   `resetState()`, cleanup, opacity-via-material-traversal). Independent of
   everything else — a standalone module, testable in isolation for its pure
   parts (matrix math, the type).
2. **LayerViewer integration** — a `models?: GeoAnchoredModel[]` prop +
   add/remove glue in `components/LayerViewer/LayerViewer.tsx`. Depends on (1).
3. **Showcase/demo page** — a new page (or an extension of the existing
   `/components/layer-viewer` showcase) demonstrating a geo-anchored duck
   model on the map, placed within the existing sample ortho/parcel extent.
   Depends on (2).
4. **Test layer** — the numeric verification method (map.project vs. actual
   rendered position, pitch/bearing sweep, GL-state-pollution regression).
   Depends on (2) and (3).
5. **Docs closeout** — depends on everything.

## Cross-layer dependencies

```
model-layer engine ──> layerviewer integration ──> showcase page ──> test layer ──> docs-closeout
```

Mostly serial this epic — the technical risk is concentrated in one module
(the custom layer), and everything downstream genuinely depends on it working
correctly first. Not forcing artificial parallelism here.
