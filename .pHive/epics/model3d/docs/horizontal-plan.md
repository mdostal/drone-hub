# Horizontal Plan — `<Model3D>` + docs-site

1. **Docs-site shell** — new public route group + `<ComponentShowcase>`
   layout + index page. Independent of everything else.
2. **VideoTour showcase-safe demo data** — a NEW, genuinely-public sample
   tour (not the real Prado data). Independent of everything else — pure
   data/asset work under `public/showcase-samples/`.
3. **`<Model3D>` component** — new component family + its own sample glTF.
   Independent of everything else.
4. **Showcase pages** (retrofit VideoTour/LayerViewer + new Model3D page) —
   depends on (1) for the shell, (2) for VideoTour's safe data, (3) for
   Model3D. LayerViewer's showcase page only needs (1) — its existing sample
   data is already safe to reuse directly.
5. **Test layer** — extends existing Vitest+RTL, depends on (3)+(4).
6. **Docs closeout** — depends on everything.

## Cross-layer dependencies

```
docs-site shell ──────────────┬──> showcase pages ──> test layer ──> docs-closeout
videotour demo data ──────────┤
model3d component ────────────┘
```

Shell, VideoTour demo data, and the Model3D component are mutually
independent (disjoint files) — all three start immediately in parallel.
