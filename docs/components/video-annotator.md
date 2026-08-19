# `<VideoAnnotator>` — scrub, zoom, draw, and export a single annotated frame (hive spec)

> Play/scrub a clip, zoom+pan into it, draw shapes/points/labels over the video, and export
> the current frame + its annotations as a PNG. Plug-and-play, importable into any app,
> publicly showcased at `/components/video-annotator`.

**Design discussion (RESOLVED architecture — read first):**
`.pHive/epics/video-annotator/stories/video-annotator-draw-and-export.yaml` — this doc
documents those decisions, it does not re-derive them.

## Why (operator intent — honor this)

CLAUDE.md's original Phase-1 component list: "**`<VideoAnnotator>`** — play a clip, scrub,
zoom, draw shapes/points/labels over the video, export." Mathew already had repo parts
that did video annotation/overlay work; this component is the reusable, plug-and-play
version of that idea — not tied to any one property or footage source.

## The contract

```ts
export interface VideoAnnotatorProps {
  /** mp4 (or any progressive format the browser plays natively) or m3u8 URL. */
  src: string;
  /** poster shown before playback starts / while the video loads. */
  poster?: string;
  /** Fired with the full current annotation list whenever it changes
   *  (add or delete). This repo has no backend — there is no server-side
   *  persistence anywhere in it — so this callback is the ONLY mechanism
   *  a consuming app has to own persistence (localStorage, an API call,
   *  whatever it wants) if it wants annotations to survive beyond this
   *  component's own lifetime. Optional and side-effect-free on this
   *  component's own behavior if omitted. */
  onAnnotationsChange?: (shapes: VideoAnnotation[]) => void;
  className?: string;
}

export type AnnotationTool = "point" | "rectangle" | "freehand" | "text";

export interface NormalizedPoint {
  u: number; // 0-1, video-frame-relative, independent of zoom/pan
  v: number;
}

export type VideoAnnotation =
  | { id: string; tool: "point"; point: NormalizedPoint }
  | { id: string; tool: "rectangle"; start: NormalizedPoint; end: NormalizedPoint }
  | { id: string; tool: "freehand"; points: NormalizedPoint[] }
  | { id: string; tool: "text"; point: NormalizedPoint; text: string };
```

`src`/`poster`/`onAnnotationsChange`/`className` is the whole prop surface — same
"deliberately minimal props" convention as `<Gallery>`/`<FileUpload>`. There's no
`annotations` controlled-prop / `initialAnnotations` — the component owns its own
annotation state internally; `onAnnotationsChange` is read-only visibility into it, not a
two-way binding.

## Behavior

1. **Playback.** Play/pause button, a scrub `<input type="range">` bound to
   `currentTime`/`duration` via real `'timeupdate'`/`'loadedmetadata'` video events (not
   optimistic state) — the same pattern `<VideoTour>`'s `<SpinVideo>` controls bar uses.
   Plain progressive sources (mp4/webm) are assigned directly; `.m3u8` sources go through
   native HLS (Safari) or `hls.js` (already a `package.json` dependency, unused elsewhere
   in this repo before this component).
2. **Zoom + pan.** A visible zoom slider (1x–3x) applies a pure CSS
   `transform: translate(...) scale(...)` to a wrapper around the `<video>` — the video's
   own decode/render resolution is never touched, only what portion of the rendered frame
   is visible. Click-drag pans once zoomed in past 1x, clamped to a bounded range. A
   "Reset zoom" button returns to 1x/no pan.
3. **Drawing tools.** A toolbar (point / rectangle / freehand / text) toggles the active
   tool; clicking it again deselects (back to pan/idle) — the same "click active to turn
   off" affordance `<LayerViewer>`'s `AnnotationLayer` toolbar uses. Every annotation's
   geometry is stored **video-frame-normalized** (`u`/`v` in `[0,1]`, relative to the
   video's own unzoomed rendered box) — independent of zoom/pan and of the video's
   intrinsic decode resolution — so a placed annotation stays glued to the correct spot on
   the underlying frame across any later zoom/pan change. A drag used to pan the zoomed
   video never places a stray annotation: the drawing `<canvas>` is `pointer-events-none`
   whenever no draw tool is active, so that gesture falls straight through to the pan
   wrapper underneath, structurally (not just via the click-vs-drag heuristic below).
4. **Click-vs-drag disambiguation.** A gesture counts as a "click" (placing a point/text
   annotation) only if it moves under 6px and completes within 500ms — otherwise it's a
   genuine drag (rectangle/freehand) and no stray point/text is dropped; symmetrically, a
   negligible drag with the rectangle/freehand tool active is discarded rather than
   committing a degenerate zero-size shape. Same constants and rationale as
   `components/Model3D/Model3D.tsx`'s `MeasureController`.
5. **Legend + delete.** A panel lists every placed annotation with a per-row delete
   action, removing it from both the canvas and the list.

## Export — a composited PNG snapshot, not a re-encoded video

**Clicking "Export snapshot" downloads a PNG of the current video frame + every currently
-drawn annotation composited on top — it does NOT produce an annotated video file.** This
is a deliberate scope decision, not an oversight:

- This repo has **no video-encoding library installed** — no `ffmpeg.wasm` or equivalent
  anywhere in `package.json`. Re-encoding a video (even just re-muxing an annotation
  overlay onto every frame of a clip) needs one.
- Adding one would be a **heavy new dependency at odds with CLAUDE.md's Vercel-bandwidth
  -conscious stack posture** — `ffmpeg.wasm` alone ships several MB of WASM to the client,
  a poor fit for a component meant to be dropped into any app without a second thought
  about bundle size.
- A single annotated-frame PNG is a real, useful, in-scope deliverable on its own (a
  drone-shot still with a hazard circled and labeled, e.g.) and needs nothing beyond the
  Canvas 2D API already used to draw the live overlay.

Mechanically: `handleExport` draws the `<video>` element onto a fresh offscreen canvas at
the video's **native decode resolution** (`video.videoWidth`/`videoHeight`, not the
currently-zoomed viewport — export always composites the whole current frame, never a
zoomed-in crop of it), replays every annotation's normalized coordinates scaled directly
to that resolution, and downloads the result via `canvas.toBlob(..., "image/png")` + an
anchor `download` link.

## Usage

```tsx
import { VideoAnnotator } from "@/components/VideoAnnotator";

<VideoAnnotator
  src="/showcase-samples/2806-prado-tour/entry.mp4"
  onAnnotationsChange={(shapes) => console.log(shapes)}
  className="h-full w-full"
/>
```

No `next/dynamic({ ssr: false })` wrapping is strictly required for module-scope reasons
(unlike `<LayerViewer>`/`<Model3D>`, `<VideoAnnotator>` touches no WebGL/map API at module
scope) — the showcase page still dynamic-imports it, matching this repo's blanket "every
heavy viewer = `next/dynamic({ssr:false})`" convention for anything with real playback/
canvas state.

Copy-portable into a standalone consumer like personal-site: everything this component
needs is `hls.js` + the DOM `<video>`/`<canvas>` APIs, no `app/` or gating dependency —
same precedent as `components/VideoTour/index.ts` and `components/Gallery/index.ts`.

## What this component deliberately does NOT do

- **No re-encoded annotated video export** — see "Export" above.
- **No server-side persistence of annotations** — `onAnnotationsChange` is the only hook;
  what a consuming app does with it (localStorage, an API call, nothing) is its own
  concern, same "no-backend posture" every other component in this repo follows.
- **No fetch/XHR, no storage SDK, no auth check.**

## Acceptance criteria

- [x] Given the point/rectangle/freehand/label tool is active, when the user interacts
      with the canvas, then the corresponding annotation shape is drawn and appears in the
      legend/list.
  Verified: `VideoAnnotator.test.tsx`'s per-tool drawing specs.
- [x] Given the video is zoomed and panned, when an annotation is drawn, then it visually
      aligns with the correct point on the underlying video frame, not the un-zoomed
      coordinate space.
  Verified: `normalizedToCanvasPoint`/`canvasPointToNormalized` round-trip specs plus a
  zoomed-draw integration spec in `VideoAnnotator.test.tsx`.
- [x] Given an annotation exists in the legend/list, when its delete action is clicked,
      then it's removed from both the canvas and the list.
  Verified: `VideoAnnotator.test.tsx`'s delete spec.
- [x] Given `onAnnotationsChange` is provided, when annotations are added or removed, then
      it's called with the current full shape set.
  Verified: `VideoAnnotator.test.tsx`'s callback specs.
- [x] Clicking Export downloads a PNG containing the current video frame composited with
      all currently-drawn annotations.
  Verified: `VideoAnnotator.test.tsx`'s export spec asserts the real `drawImage`/annotation
  draw calls against a mocked canvas context, not just "a download was triggered."
- [x] A drag gesture used to pan the zoomed video does not also place a stray annotation
      shape.
  Verified: `VideoAnnotator.test.tsx`'s pan-vs-draw specs — the overlay canvas is
  `pointer-events-none` with no tool active, and the click-vs-drag movement/duration
  threshold covers the tool-active case.
- [x] Given `npm run build` and `npm test`, when run after this story, then both pass
      cleanly, and `/components/video-annotator` + `/docs/components/video-annotator` both
      render with zero errors.

## Phase fit

- **This story (`video-annotator-showcase-integration`, `video-annotator` epic):** this
  doc + the showcase page + the `/docs/components/[slug]` and root ToC wiring — closes out
  the `video-annotator` epic (core player + zoom/pan, then drawing/export, both already
  shipped on this branch).
- **Deliberately out of scope, permanently (not deferred):** re-encoded annotated-video
  export — see "Export" above; revisit only if a lightweight (non-`ffmpeg.wasm`-class)
  video-encoding approach becomes a real option, not by default.
