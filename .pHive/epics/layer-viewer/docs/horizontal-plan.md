# Horizontal Plan — `<LayerViewer>`

Layers this epic touches:

1. **Spec doc** — `docs/components/layer-viewer.md` (doesn't exist yet, unlike
   video-tour which had one from kickoff). Independent of code.
2. **Typed data layer** — `lib/layer-types.ts` (the layer registry). No
   dependency on anything else in this epic.
3. **Gating extension** — `middleware.ts` matcher + `lib/gate.ts`'s
   `sanitizeNextPath` generalization. Independent of the layer registry.
4. **Sample data** — `public/layer-viewer-samples/<slug>/` (COG ortho,
   hillshade, synthetic parcel GeoJSON) + a `.gitignore` scoped negation for
   `*.tif`. Depends on (2) for the manifest shape to conform to.
5. **Component layer** — `<LayerViewer>` (MapLibre map + registry-driven
   sources) + `<LayerControl>` (toggle/opacity panel). Depends on (4) for real
   data to develop against, and (1) as the spec of record.
6. **Integration** — gated route `/properties/[slug]`. Depends on (5) and (3).
7. **Test layer** — extends the existing Vitest+RTL infra (no new setup
   needed, unlike video-tour which had to stand it up). Depends on (5).

## Cross-layer dependencies

```
spec-doc ─────────────────────────────┐
registry-types ──> sample-data ──> component-layer ──> integration ──> docs-closeout
gating-extension ─────────────────────────────────────┘              │
                                       test-layer ─────────────────────┘
```

Spec-doc, registry-types, and gating-extension are mutually independent —
all three can start immediately and run in parallel (disjoint files:
`docs/components/layer-viewer.md`, `lib/layer-types.ts`,
`middleware.ts`+`lib/gate.ts`).
