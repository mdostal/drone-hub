# Vertical Plan — `<LayerViewer>`

## Slice 1 — Foundations (3-way parallel)
**Proves:** the architectural contract (registry type), the doc spec, and the
gating extension all exist independently before anything is built against them.
- `layer-viewer-spec-doc` — `docs/components/layer-viewer.md`.
- `layer-viewer-registry-types` — `lib/layer-types.ts`.
- `layer-viewer-gating-extension` — `middleware.ts` matcher + generalized
  `sanitizeNextPath` (fixes the grill-caught `/tours`-hardcode bug).

## Slice 2 — Real sample data
**Proves:** a real property-layers manifest exists, conforming to the
registry type, with real (or clearly-labeled-synthetic) geospatial assets.
- `layer-viewer-sample-data` — sample COG ortho (rio-tiler's fixture),
  hillshade (real or synthetic, documented either way), synthetic parcel
  boundary GeoJSON, `.gitignore` fix.

## Slice 3 — The component, proven against real data
**Proves:** the "killer feature" — toggle + opacity-fade layers on a real map.
- `layer-viewer-core-components` — `<LayerViewer>` + `<LayerControl>`.

## Slice 4 — Gated integration + tests
**Proves:** the whole vertical stack (gate → registry → sample data →
component) is connected end to end, and it's verifiably tested, not just
eyeballed.
- `layer-viewer-gated-route-integration` — `/properties/[slug]`.
- `layer-viewer-test-suite` — extends existing Vitest+RTL.

## Slice 5 — Close-out
- `layer-viewer-docs-acceptance-closeout` — reconcile spec doc vs. reality,
  verify every acceptance criterion against real code.

## Deferred (explicitly out of this epic)
- MeasureTool, AnnotationLayer, CompareSwipe, AlignControl — Phase 2 per CBA.
- `<Model3D>` — Phase 3 per CBA, separate epic.
- PMTiles rendering path, R2 asset hosting, cross-origin gated-asset auth
  (presigned URLs / proxy) — real gaps named in the design discussion, deferred
  until real large orthos actually need them.
