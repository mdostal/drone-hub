# Design discussion — LayerViewer Phase 2 tools

## Goal

Ship the four still-missing tools from CBA's original LayerViewer Phase 2
plan: `MeasureTool`, `AnnotationLayer`, `CompareSwipe`, `AlignControl`.
(`2.5D drape` is out of scope here — already shipped as `<LandOverlay>`.)

## Proposed approach — four independent stories

**MeasureTool.** Toggle button (matching `<Model3D>`'s measure-tool UX:
"Measure: On/Off" pill, click-to-place, clear action, legend). Click two
points on the map → `@turf/turf`'s `distance()` computes real-world
distance in meters, rendered as a MapLibre GL line layer + a floating
label. A third click clears and restarts, same behavior as `<Model3D>`'s
existing tool for consistency across the framework.

**AnnotationLayer.** Wraps `terra-draw` + the new
`terra-draw-maplibre-gl-adapter` dependency. Point/line/polygon/freehand
draw modes, a small mode-switcher toolbar, and a legend/list of placed
annotations with per-annotation delete. Deliberately does NOT persist
annotations server-side (no backend in this framework repo) — an optional
`onAnnotationsChange` callback prop lets a consuming app own persistence,
matching this repo's "own the viewer" / no-backend-in-the-bundle posture.

**CompareSwipe.** A vertical swipe divider over two of the already-toggleable
layers (e.g. ortho vs. hillshade, or two dates once a consumer supplies
them) — drag the divider left/right, left side renders layer A, right side
renders layer B, implemented via a clip-rect/mask on the MapLibre canvas
(the standard swipe-compare technique — CSS clip-path on a duplicated map
instance, OR two paint layers with a shared clip; the story's own research
step should confirm which MapLibre-GL-native technique is real and correct
before implementing — the `mapbox-gl-compare`-style pattern is the closest
public precedent even though this project uses maplibre-gl, not mapbox-gl).

**AlignControl.** A manual nudge UI — small arrow buttons (or drag) that
offset a selected raster layer's rendering by a few meters in
lat/lng-delta space, a numeric readout of the current offset, and a
reset-to-zero action. This directly answers CLAUDE.md's own flagged
requirement: "no RTK = 1-3m drift → AlignControl manual nudge is
mandatory." Offset state lives in LayerViewer's own React state (no
persistence — same "consuming app owns persistence" posture as
AnnotationLayer, via an optional `onAlignmentChange` callback).

## Risks

- **CompareSwipe's exact MapLibre implementation technique is a real open
  question**, not a solved pattern already used elsewhere in this repo —
  its story's research step must confirm the correct approach (clip-path
  vs. dual-map vs. paint-property clipping) against MapLibre GL's actual
  API before implementing, not assume a Mapbox-specific plugin's approach
  transfers directly.
- terra-draw + its MapLibre adapter is a genuinely new, previously-unused
  dependency pairing in this codebase — AnnotationLayer's story should
  budget real integration-debugging time, not assume it "just works" from
  the README.

## Open questions

None blocking — both risks above are story-level implementation research,
not epic-level unknowns.

## Scale assessment

**Medium.** Four independent stories (no shared dependency between them),
proceeding directly to stories — the dependency graph is already flat.
