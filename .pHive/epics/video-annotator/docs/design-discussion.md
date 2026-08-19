# Design discussion — `<VideoAnnotator>`

## Goal

Ship the last unbuilt component from CLAUDE.md's original Phase-1 MVP
list: a single-clip video player with scrub, zoom, a shapes/points/labels
drawing overlay, and export. Fresh build -- the "existing code to reuse"
CLAUDE.md references lives on an old, inaccessible Replit account.

## Proposed approach — three stories

**Story 1 — core player.** `components/VideoAnnotator/VideoAnnotator.tsx`:
a `<video>` element (reusing `<VideoTour>`'s `videoRef` + playback pattern,
`hls.js` for streaming sources when `src` is an `.m3u8`, plain `<video src>`
otherwise) with a scrub bar (native or custom -- match this repo's existing
control styling either way), play/pause, and a zoom control (pan + scale
the video's rendered viewport via CSS transform on a wrapping container,
not re-encoding -- click-drag to pan while zoomed, a zoom slider or
scroll-to-zoom, a reset-zoom action).

**Story 2 — drawing overlay + export.** A `<canvas>` positioned exactly
over the `<video>` element (same dimensions, resized on video
metadata-load and window resize), drawing shapes (point/rectangle/
freehand-line) via pointer events, plus a label/text tool. A small
toolbar (matching this repo's established panel styling --
bg-surface/border-border/text-accent tokens) to switch tools, a legend/
list of placed annotations with per-annotation delete (same pattern
AnnotationLayer just established for LayerViewer), and an optional
`onAnnotationsChange?: (shapes: VideoAnnotation[]) => void` prop (no
server persistence -- same no-backend posture as every other component
here). "Export" = composite the current video frame + all currently-drawn
annotations onto an offscreen canvas and download as a PNG -- explicitly
NOT a re-encoded annotated video (see research-brief's "Export" section
for why: no video-encoding library installed, adding one is a heavy,
out-of-scope dependency choice for this epic).

Reuse `<Model3D>`'s proven click-vs-drag disambiguation constants/pattern
(`CLICK_MAX_MOVEMENT_PX`/`CLICK_MAX_DURATION_MS`) so a genuine draw click
isn't confused with a pan-drag gesture when zoomed in.

**Story 3 — docs + showcase integration.** `docs/components/video-
annotator.md` (matching sibling doc structure), showcase page at
`app/(showcase)/components/video-annotator/page.tsx` using one of the
existing real `public/showcase-samples/2806-prado-tour/*.mp4` clips, and
an 9th `TocEntry` on the root page.

## Risks

- Canvas-over-video positioning must stay pixel-perfect across resize and
  zoom -- a real, testable geometry concern (canvas dimensions must track
  the video element's actual rendered box, not its intrinsic resolution).
- Story 2's research step must actually confirm the PNG-export-only scope
  decision is still right (not silently inherited from the research brief
  without a second look) before implementing.

## Open questions

None blocking.

## Scale assessment

**Medium** -- three stories, sequential (2 depends on 1's video/canvas
plumbing, 3 depends on 2 being feature-complete). No H/V planning needed.
