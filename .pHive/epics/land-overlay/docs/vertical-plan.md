# Vertical Plan — 3D-model-on-land overlay

## Slice 1 — The engine (highest risk, built and proven first)
`land-overlay-model-layer` — `lib/geo-model-types.ts` + `lib/maplibre-model-
layer.ts`. Proves the hard part in isolation: given a `GeoAnchoredModel` and
a MapLibre map, a `CustomLayerInterface` that correctly loads, positions, and
renders a glTF, cleans up after itself, and doesn't corrupt the GL state for
other layers.

## Slice 2 — Wired into LayerViewer
`land-overlay-layerviewer-integration` — `models?: GeoAnchoredModel[]` prop.
Proves the engine composes into the existing, already-shipped component
without regressing its existing layer-toggle behavior.

## Slice 3 — Real, visible demo
`land-overlay-showcase-page` — the sample duck, geo-anchored within the
existing sample ortho/parcel extent, on a real page a human can actually look
at.

## Slice 4 — Rigorous verification
`land-overlay-test-suite` — the numeric placement-accuracy check (not just
"looks right"), the pitch/bearing sweep, and the GL-state-pollution
regression test.

## Slice 5 — Close-out
`land-overlay-docs-acceptance-closeout`.

## Deferred (queued next per CLAUDE.md's confirmed priority order)
- Landscape-to-Minecraft voxelizer + gated content-engine page.
- Telemetry-driven scene-tracked video overlay.
- CBA's original Phase 2 tools (Measure/Annotate/Compare/Align).
