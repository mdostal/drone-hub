# Vertical Plan — `<Model3D>` + docs-site

## Slice 1 — Foundations (3-way parallel)
- `model3d-showcase-shell` — public route group, `<ComponentShowcase>`,
  index page listing components (initially empty/placeholder cards, filled
  in by slice 2).
- `model3d-videotour-demo-data` — a new, genuinely public-safe sample tour
  (NOT the real Prado data) under `public/showcase-samples/`.
- `model3d-component` — `<Model3D>` itself + a public-domain sample glTF.

## Slice 2 — Showcase pages
- `model3d-showcase-pages` — VideoTour + LayerViewer (retrofit) + Model3D
  (new) each get a real page in the shell, proving the pattern against all
  three components.

## Slice 3 — Tests + close-out
- `model3d-test-suite` — coverage for `<Model3D>`'s logic (mirrors
  LayerViewer's jsdom-can't-do-WebGL constraint) + smoke tests confirming
  showcase pages render without error and without touching gated routes.
- `model3d-docs-acceptance-closeout` — verify docs, confirm the showcase
  pages are genuinely public (no accidental gating, no accidental real-data
  reuse), close acceptance criteria.

## Deferred (explicitly out of this epic, queued next per CLAUDE.md's
confirmed priority order)
- 3D-on-land overlay (geo-anchored `<Model3D>` inside `<LayerViewer>`).
- Landscape-to-Minecraft voxelizer + gated content-engine page.
- Telemetry-driven scene-tracked video overlay.
- CBA's original Phase 2 tools (Measure/Annotate/Compare/Align) — now
  queued behind all of the above per operator instruction.
