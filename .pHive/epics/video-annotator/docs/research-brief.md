# Research brief — `<VideoAnnotator>`

## Gap confirmed

CLAUDE.md's original Phase-1 MVP component list, item 3: "`<VideoAnnotator>`
— play a clip, scrub, zoom, draw shapes/points/labels over the video,
export. Mathew already has repo parts that did video annotations/overlays
— reuse them." Confirmed via the operator directly: that reference is an
old Replit project on a different account, not locatable/portable into
this repo. Building fresh.

Distinct from `<VideoTour>` (already shipped): VideoTour is a
scrollytelling clip-navigator (steps a floor plan through doorway-linked
clips, no drawing). VideoAnnotator is a single-clip player with a drawing
overlay, scrub, zoom, and export -- a different job. Both are named
together throughout the docs (`docs/components/video-tour.md`:
"Ties into existing planned `<LayerViewer>`, `<Model3D>`,
`<VideoAnnotator>`, `<Gallery>`") confirming they were always meant to be
siblings, not the same component under two names.

## Existing patterns to reuse

- `components/VideoTour/TourStage.tsx` — the `<video>` element + `videoRef`
  pattern already used in this repo for clip playback. `hls.js@^1.5.0` is
  already installed for streaming sources.
- `components/LayerViewer/AnnotationLayer` work (just shipped) established
  the "draw shapes/points/labels, no server persistence, optional
  `onXChange` callback for a consuming app to own state" pattern -- but
  that's terra-draw + lng/lat map coordinates, not applicable to video
  pixel-space. VideoAnnotator's drawing needs plain HTML5 Canvas 2D
  (pointer events -> canvas draw calls), no map library involved.
- `components/Model3D/Model3D.tsx`'s measure-tool click/drag-threshold
  pattern (`CLICK_MAX_MOVEMENT_PX`/`CLICK_MAX_DURATION_MS`) is a real,
  proven precedent for distinguishing a genuine click/tap from a
  drag-to-pan gesture on a canvas -- worth reusing the same technique for
  VideoAnnotator's draw-vs-pan/zoom-drag disambiguation.

## "Export" -- a real scope decision, not a given

No video-encoding library (ffmpeg.wasm or similar) is installed, and
adding one would be a significant, heavy new dependency that cuts against
CLAUDE.md's Vercel-bandwidth-conscious stack posture. A full annotated-
video re-export (burning drawn shapes into a new .mp4) is out of scope for
this epic on that basis. In-scope "export": composite the current video
frame + its annotations onto an offscreen canvas and export as a
downloadable PNG (`canvas.toBlob()` + a download link) -- a real,
lightweight, client-side-only capability with zero new dependencies. This
decision needs to be confirmed as reasonable during the implementing
story's research step, not silently assumed correct without a second look
at whether a lighter-weight video-export path exists.

## Sample data

Reuse one of the existing real, rights-cleared 2806-prado-tour clips
(`public/showcase-samples/2806-prado-tour/*.mp4`) for the showcase demo --
same precedent as `<Gallery>`'s reuse of the sibling `.jpg` stills.

## Scale assessment

Medium. Three stories: (1) core player + scrub + zoom, (2) drawing overlay
+ frame export (depends on 1 -- needs the video/canvas plumbing from the
first story), (3) docs + showcase integration (depends on 2).
