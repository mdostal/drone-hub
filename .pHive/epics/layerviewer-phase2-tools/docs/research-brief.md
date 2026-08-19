# Research brief — LayerViewer Phase 2 tools

## Gap confirmed

CBA's original Phase 2 plan (CLAUDE.md's "Build phases" section): "MeasureTool
+ AnnotationLayer + CompareSwipe + AlignControl + 2.5D drape." Of these, 2.5D
drape is already shipped (`<LandOverlay>`'s `GeoAnchoredModel` compositing —
this epic does NOT re-scope that). The other four have zero implementation:
`grep -n "measure\|annotat\|compare\|align" components/LayerViewer/LayerViewer.tsx`
returns nothing across the component's 725 lines.

`@turf/turf@^7.1.0` and `terra-draw@^1.0.0` have both been installed,
unused, since project scaffolding — this was always the intended stack for
exactly this work (CLAUDE.md's stack section: "`@turf/turf` + `terra-draw`
(measure/annotate)").

## Real precedent to follow

`<Model3D>` already shipped a real measure tool (`brand-theming-and-viewer-
polish` epic, `model3d-measure-tool-and-legend` story) — click two points,
see a distance label, an on-canvas legend, a toggle button. Same UX pattern,
different geometry space (2D map lng/lat via `@turf/turf`'s `distance()`
instead of 3D Euclidean via `THREE.Vector3`). Match that interaction
pattern (toggle button, click-to-place, clear-measurement action, legend
panel) rather than inventing a new one.

## terra-draw + MapLibre — a real gap found

`terra-draw@^1.0.0`'s core package ships only `base.adapter` (an abstract
class) — no MapLibre-specific adapter. Confirmed via
`find node_modules/terra-draw/dist -iname "*adapter*"`. A real, compatible
adapter package exists and needs to be added:
`terra-draw-maplibre-gl-adapter@1.4.1`, peer deps `terra-draw: ^1.0.0` /
`maplibre-gl: >=4` (this repo has `maplibre-gl@^4.7.0` — compatible).

## AlignControl — CLAUDE.md flags this as load-bearing, not optional

Phase-0 section: "no RTK = 1-3m drift → `AlignControl` manual nudge is
mandatory." This isn't a nice-to-have polish item — every georeferenced
overlay in this repo (ortho/hillshade/thermal layers) can be visibly
misaligned from the satellite base by 1-3m with no way to correct it today.

## Scale assessment

Medium — four independent UI tools (Measure, Annotate, Compare, Align), no
shared implementation dependency between them (only AnnotationLayer touches
terra-draw; the others don't), so they can be built in parallel as
independent stories. No H/V planning needed — the dependency graph is
already flat (four independent stories + one closeout), which is exactly
what vertical-slice planning would produce anyway.
