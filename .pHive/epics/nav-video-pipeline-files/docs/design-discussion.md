# Design discussion — site navigation, real video controls, ODM pipeline docs, generic file components

## 0. Prelude

No prior KG decisions surfaced. No `north_star` block. This epic follows a
single, wide-ranging operator message, decomposed into four streams after a
scope-boundary clarification (AskUserQuestion, confirmed): the "files,
contracts, back and forth, uploading, processing" thread is **generic
reusable UI components only** — no backend, no auth, no real contract
logic. That business logic still belongs to `personal-drone`, unchanged
from the scope boundary CLAUDE.md already states; this epic builds
component pieces `personal-drone` (or anyone) could later wire to a real
backend, demoed here against sample/mock data like every other component.

Operator's own words, verbatim: "the overall component library, the info
-- https://ui.shadcn.com/ -- like, let's build it out to look nicer... then
the map overlays and stuff -- i think we have most of the things, but we
probably need to display them a few more ways or get odm exports or do
something."

## 1. Goal

Four streams:
1. **Site navigation/IA polish** toward shadcn/ui's actual presentation
   quality — a persistent way to move between components without
   returning to `/` every time, plus the small, expected detail shadcn's
   own docs have that this repo doesn't: copy-to-clipboard on code blocks.
2. **Real, user-facing video controls** for `<VideoTour>`'s spin/transition
   `<video>` elements — confirmed live in the code: they exist, but are
   autoplay+muted with zero user controls (no play/pause, no scrub, no
   speed), and have never been exercised against real video content since
   every current sample room is stills-only (`spin: null`/`clip: null`
   everywhere). "Different controls for speeds and whatnot," the
   operator's own words.
3. **LayerViewer display-mode + real-data-pipeline documentation** — CBA's
   original spec references a `/pipeline` directory for WebODM/GDAL/PDAL
   tooling that was never actually created, and there's no documented
   mapping from real WebODM/OpenDroneMap output to this framework's
   `LayerDef`/`ModelDef` manifest shapes. "We probably need to display
   them a few more ways or get odm exports or do something... i assume
   there's more to it, some description."
4. **Generic file/contract UI components** — `FileUpload`, a
   file viewer/download component, and a `ProcessingStatus` indicator.
   Framework-level only: presentational + a typed props contract, demoed
   against sample/mock data, no storage/auth/backend of any kind.

## 2. Research: current state (verified directly)

- **No persistent nav.** `app/(showcase)/` has no shared `layout.tsx`
  beyond the root layout — every showcase page and every
  `/docs/components/[slug]` page is an island; the only way back to
  another component is the root `/` landing page. Confirmed via
  `find app/(showcase) -iname layout.tsx` — zero results.
- **No copy-to-clipboard anywhere** — `grep -rn "clipboard"` across
  `components/showcase*`/`components/Markdown.tsx` returns nothing. Every
  showcase page's `<ComponentShowcase code={USAGE_CODE}>` block and every
  doc page's fenced code blocks are plain, uncopyable `<pre>` text.
- **`<VideoTour>`'s P2 video code path is real but bare**, confirmed by
  reading `components/VideoTour/TourStage.tsx` directly: `room.spin ?
  <video autoPlay loop muted playsInline /> : <img className="videotour-kenburns" />`
  and `transition.clipUrl ? <video autoPlay muted playsInline onEnded={...} /> : <wipe>`.
  Both `<video>` elements are autoplay/muted/no-controls — background-video
  style, not a real player. `grep -n "playbackRate"` across
  `components/VideoTour/*.tsx` returns nothing — no speed control exists
  anywhere. And structurally: every room in both sample manifests
  (`public/showcase-samples/demo-house/tour.json`,
  the real-but-currently-nonexistent-in-this-repo Prado tour) sets
  `spin: null` and every edge sets `clip: null` — this whole code path is
  "wired but never actually run," per `TourStage.tsx`'s own comment:
  "Structural branch — unexercised in P1 since every Prado room has
  spin: null."
- **No `/pipeline` directory exists.** CLAUDE.md's own "Stack / plugins —
  FINALIZED" section states: "Pipeline (WebODM/GDAL/rio-*/PDAL/tippecanoe)
  lives in `/pipeline` as scripts+docker, never in the bundle" — but
  `find . -maxdepth 2 -iname "pipeline*"` (excluding `node_modules`)
  returns nothing. This was always the stated target, never built.
- **No file-upload/file-viewer-shaped components exist** —
  `find components -iname "*upload*" -o -iname "*file*"` returns nothing.
  Clean slate, no naming collisions to worry about.
- **`lib/layer-types.ts`'s `LayerDef`/`PropertyLayers` and
  `components/Model3D/Model3D.tsx`'s `ModelDef`** are this repo's existing
  precedent for "a typed manifest shape a real pipeline's output gets
  mapped into" — the ODM-pipeline documentation stream should describe
  real WebODM output file-by-file against these EXISTING shapes, not
  invent new ones.

## 3. Proposed approach

### 3a. Site navigation/IA polish

Add a shared layout for the showcase + doc route groups: a persistent,
slim top-of-page (or side, if it reads better once built) nav listing all
7 components/tools, each linking to its live demo — visible on every
`/components/*` and `/docs/components/*` page, not just `/`. This does
**not** replace the root `/` landing page (which stays the fuller
table-of-contents with descriptions) — it's a thin, always-present
wayfinding strip so a visitor doesn't have to backtrack to `/` to jump
components. Keep it simple: a horizontal scrollable strip of component
name links is enough at 7 items — no need for shadcn's full
category-grouped sidebar at this scale (grill-reviewed and confirmed —
the doc's original scope call holds).

**Two implementation specifics from grill (finding #5), not left
implicit:** `app/(showcase)/docs/components/[slug]/page.tsx` is fully
statically prerendered today (`generateStaticParams`, all 7 slugs render
to static HTML) — the new shared layout must not call any dynamic API
(`cookies()`, `headers()`, `searchParams`) or it forces that route back to
dynamic (ƒ) rendering; a `next build` route-table check (all 7 doc routes
still ○) is a required acceptance criterion, not implicit. And if the nav
strip wants active-route highlighting (showing which component you're
currently on), that needs `usePathname()`, which needs a client boundary
— don't make the whole shared `layout.tsx` `"use client"` for this (that
needlessly widens the client boundary for the entire subtree); isolate
active-route logic in a small nested client component instead, keeping
`layout.tsx` itself a Server Component.

Add copy-to-clipboard buttons to code blocks: both
`<ComponentShowcase code={...}>`'s usage-snippet block and
`components/Markdown.tsx`'s `pre` renderer (used by both doc pages and,
as of the last epic, the ContentEngine page). A small shared
`<CopyButton text={...}>` component (Clipboard API,
`navigator.clipboard.writeText`). **Corrected after grill (finding #6):**
Vercel is always HTTPS and localhost is a secure context in every major
browser, so `navigator.clipboard` existing isn't actually in question in
this app's real deployment/dev contexts — the doc's original "non-HTTPS"
framing was solving a non-problem. The real defensive need is different:
`writeText()` returns a Promise that can still reject in a secure context
(e.g. `NotAllowedError` from document-focus loss, or a Permissions-Policy
restriction) — the button needs a `.catch()` on that promise, not a
feature-detection guard, or a normal click can produce an unhandled
promise rejection.

### 3b. Real VideoTour controls + real sample video content

**Revised after grill (finding #1): controls apply to the `spin` video
only, NOT the transition `clip` video.** Grill traced the actual code:
`VideoTour.go()`'s only path to `arrive()` (which clears `busyRef`/`busy`,
and `busy=true` disables every `DoorwayControls`/`FloorPlanMap` button in
the whole component) is `TourStage`'s `onEnded` handler firing when a
transition clip finishes playing. If a visitor pauses that clip — or
scrubs backward off the end — `'ended'` never fires, `arrive()` never
runs, and the tour permanently locks up with no escape hatch anywhere in
the current code. Giving the user pause/scrub control over the one video
element the navigation state machine depends on completing is a real,
shippable deadlock, not a hypothetical. The `spin` video has no such
dependency (it's a passive looping background, nothing waits on it) — safe
to control freely.

1. **Controls bar, `spin` video only**: a themed, on-video control overlay
   — play/pause, a scrub/seek bar (`<input type="range">` bound to
   `currentTime`), and a playback-speed selector (a small set of buttons —
   0.5x/1x/1.5x/2x, bound to `video.playbackRate`). Remove `autoPlay`+`muted`
   as the *only* mode; the video should still autoplay muted on arrival (so
   the existing silent-loop demo behavior isn't regressed for anyone who
   doesn't touch the controls) but a visitor can now pause, scrub, unmute,
   and change speed. **The transition-`clip` `<video>` element stays exactly
   as it is today — autoplay, muted, no user controls, `onEnded` still the
   only path to `arrive()`.** This isn't a permanent limitation, just a
   scope line: giving the transition clip real user control safely would
   require a real fallback path to `arrive()` independent of `'ended'`
   (e.g. driving arrival off `currentTime >= duration` instead of the
   event, plus deciding what "pause mid-transition" even means for the
   tour's state machine) — that's a separate, real feature, not a small
   addition, and isn't in scope here.
2. **Real sample video content is required to actually exercise this** —
   right now `spin` is `null` everywhere, so this code path (now the one
   that gets real controls, per the revision above) has literally never
   rendered. Source or generate a short, small, public-safe looping sample
   clip (a few seconds, a real permissively-licensed stock/demo clip, or a
   locally-generated synthetic clip) for at least one room's `spin` field
   in `public/showcase-samples/demo-house/tour.json` (the public, ungated
   demo manifest — never the real property tour, which doesn't exist in
   this repo per the gating-removal epic). **Two distinct risks here, not
   one (grill finding #4) — do not treat them as the same problem:**
   (a) the licensing/rights search itself (same category as the
   LayerViewer ortho-sourcing problem from the last epic — a real search,
   not a given), and (b) unlike that epic's SVG-stills fallback (trivial
   hand-authored text, zero tooling), **this repo has no video-encoding
   tooling anywhere** — no `ffmpeg`, no video script/dependency of any
   kind. A "locally-generated synthetic clip" fallback isn't already
   available the way the SVG-stills one was; standing up minimal
   video-encoding capability (even just enough to produce one small,
   clearly-labeled synthetic MP4/WebM) is itself real, unbudgeted work if
   the licensing search comes up empty.
3. Update `docs/components/video-tour.md` to document the now-real
   controls (currently the doc's acceptance-criteria section frames P2
   clip/spin playback as smoke-tested-only, unexercised — that framing
   needs correcting once real content + real controls exist, mirroring
   how `model3d.md` was corrected last epic).

### 3c. LayerViewer display modes + `/pipeline` + ODM docs

1. **One concrete new display mode**: a fullscreen toggle for
   `<LayerViewer>` (expand the map to fill the viewport, collapse back) —
   the smallest real "display it another way" that doesn't require
   inventing new interaction design from scratch (unlike CBA's
   `CompareSwipe`/`AlignControl`, which are their own multi-story features
   already correctly queued behind this work per CLAUDE.md's priority
   order — not reopened here). **Two implementation specifics, confirmed
   by grill against the real code, not left implicit:**
   - **No explicit `map.resize()` call is needed.** Checked
     `maplibre-gl`'s own source directly: `trackResize` defaults to `true`
     and the `Map` constructor wires up a real `ResizeObserver` on its
     container that calls `resize()` automatically on any box-size
     change — a CSS-driven or Fullscreen-API-driven container resize
     self-corrects with zero extra code.
   - **Fullscreen must target `LayerViewer`'s outer wrapper div, not the
     inner `containerRef` div the map itself mounts into.**
     `LayerViewer.tsx`'s returned JSX has three sibling divs in one
     wrapper: the map container, the `showLoading` overlay, and the
     `loadError` overlay. Calling `requestFullscreen()` on `containerRef`
     (the naturally-tempting target — "that's the map") would put the
     loading/error overlays outside the browser's fullscreen top-layer as
     non-descendant siblings, and they'd silently stop rendering while
     fullscreen is active. The toggle button + fullscreen state also need
     an explicit API-shape decision before implementation — matching the
     existing ref+callback composition pattern (`LayerViewerHandle`'s
     `toggleLayer`/`setOpacity`), expose it as a handle method, an internal
     self-contained button, or both — pick one and document why, don't
     leave it to be improvised mid-implementation.
2. **Create `/pipeline`** (scripts + a `README.md`, no docker image build
   in this pass — that's a bigger, separate undertaking) documenting the
   target WebODM/GDAL/PDAL toolchain CLAUDE.md already specifies, and,
   concretely: **a written mapping from real WebODM/ODM output files to
   this framework's existing manifest shapes** — e.g. `odm_orthophoto.tif`
   → a `LayerDef` `raster`/`cog` entry (with the same `rio warp`/`rio
   cogeo` reprojection step this session's COG-bounds-bug fix already
   established as required), `odm_dem/dsm.tif` → the hillshade-generation
   pattern already used for sample data, `odm_texturing/odm_textured_model.glb`
   (or a converted mesh) → a `ModelDef` entry. Documentation-first, not a
   working conversion script — CLAUDE.md's own target pipeline is a
   deferred, real-hardware-gated concern (Phase-0 nadir pass), so a
   working end-to-end script has nothing real to run against yet; a clear
   mapping doc is the actually-actionable deliverable here.

### 3d. Generic file/contract UI components

Three components, `components/FileUpload/`, `components/FileViewer/` (or
similar — naming TBD during implementation to avoid colliding with
existing conventions), `components/ProcessingStatus/`:

- **`<FileUpload>`**: drag-and-drop + click-to-browse target, a typed
  `onFilesSelected(files: File[])` callback prop, no upload logic of its
  own (the consuming app owns the actual network call). Demoed on its own
  showcase page against a no-op handler that just lists selected
  filenames.
- **A file viewer/download component**: given a typed manifest (`{name,
  url, sizeBytes, contentType}[]` — same "typed registry" shape convention
  as `LayerDef`/`ModelDef`), renders a list with a download link per file
  and an icon/label by content type. **Corrected after grill (finding
  #2):** the doc's original "basePath-safe via `next/link`" framing was
  wrong on two counts, both confirmed against the real code —
  `lib/base-path.ts`'s own header comment explicitly prohibits using
  `withBasePath()` "inside `components/LayerViewer` or `components/VideoTour`
  themselves — those are the portable, plug-and-play library components
  and must stay basePath-agnostic," and this new component is the exact
  same kind of portable component; separately, `next/link` is built for
  client-side route navigation, not triggering a file download (no
  `download` attribute support). The component takes **already-resolved
  URLs** as part of its manifest prop (same contract as `LayerDef.url`)
  and renders a plain `<a href={url} download>` — basePath resolution is
  the showcase page's job (`withBasePath()` on the sample manifest before
  passing it in), exactly mirroring how `VideoTour`'s and `LayerViewer`'s
  own showcase pages already call `withBasePath()` on their `manifest`
  prop today. No real file storage — demoed against a small sample
  manifest pointing at a couple of `public/`-hosted sample files.
- **`<ProcessingStatus>`**: a typed `status: "queued" | "processing" |
  "done" | "error"` (+ optional `progress: number` 0-1) indicator —
  presentational only, no polling/websocket logic of its own (the
  consuming app owns how status updates arrive). Demoed with a
  showcase-page control that cycles through the states — **the demo
  control (and `FileUpload`'s no-op filename-listing handler) must be
  visually unmistakable as inert** (grill finding #7): this is a live,
  public-forever demo site, and a simulated progress/success sequence
  could read as a real pipeline job to a first-time visitor if it isn't
  clearly labeled as a demo control.

All three get their own showcase page (added to the root ToC + the new
persistent nav from 3a) and a `docs/components/*.md` writeup, matching
every existing component's pattern exactly.

## 4. Risks

- **Sourcing real sample video content (3b) is TWO distinct risks (grill
  finding #4), not one**: the licensing/rights search itself (same
  category as the LayerViewer ortho-sourcing problem last epic), AND —
  unlike that epic's trivial hand-authored-SVG fallback — this repo has
  zero video-encoding tooling anywhere. If the licensing search comes up
  empty, standing up even minimal capability to produce one small,
  clearly-labeled synthetic clip is itself real, unbudgeted work, not an
  already-available fallback.
- **The VideoTour controls-bar scope line (spin only, not the transition
  clip) is load-bearing, not a style preference** (grill finding #1) — the
  transition clip's `'ended'` event is the only path to `arrive()`, which
  is what un-disables every navigation control in the component. Giving a
  user pause/scrub control over that element without a real
  `'ended'`-independent fallback path is a genuine, shippable deadlock.
  Do not expand controls to the transition clip in this epic without also
  building that fallback path as real, tested work.
- **Scope-boundary drift risk on 3d is the single highest-stakes item in
  this epic**, given this exact ambiguity already triggered one
  significant scope correction earlier this session. The AskUserQuestion
  answer is explicit and load-bearing: generic components, sample/mock
  data, zero backend/auth/storage. Any implementing story that starts
  writing real upload/storage/auth logic is out of bounds — flag and stop
  rather than build it.
- **3a's "shared layout" change touches every showcase + doc page's
  render tree** — low individual risk per page, but it's a genuinely
  cross-cutting change (unlike 3b/3c/3d, which are additive/isolated).
  Needs verification across all 7 showcase pages + all 7 doc pages, not
  just a couple of spot checks.
- **`/pipeline`'s documentation-only scope (3c.2) needs to stay
  documentation-only** — CLAUDE.md is explicit that real pipeline tooling
  is gated on the Phase-0 nadir pass (real hardware/flight, not a coding
  task). A story that tries to build a working conversion script against
  data that doesn't exist yet would be speculative, untestable work.

## 5. Dependencies

- No new runtime npm dependencies expected for 3a/3b/3d (Clipboard API and
  `<video>` controls are native browser APIs; drag-and-drop file input is
  native HTML). 3c's `/pipeline` scripts (if any are written beyond
  documentation) would use the same `rasterio`/`rio-cogeo`/GDAL toolchain
  already established this session as a one-time-script, non-bundled
  dependency category.
- 3b's real sample video needs a real source — same category of research
  risk as 4's ortho-sourcing, named explicitly in Risks above.

## 6. Open questions

1. Does the persistent nav (3a) belong in a shared layout for BOTH
   `app/(showcase)/` and `app/(showcase)/docs/components/[slug]/`, or does
   the doc-page route need slightly different chrome (it already has its
   own "← Components" back-link)? — Recommend one shared layout covering
   both route groups, replacing the doc page's existing single back-link
   with the same persistent strip everything else gets, for genuine
   consistency rather than two slightly-different nav treatments.
2. Should 3d's three file components live under one `components/Files/`
   directory or three top-level `components/FileUpload/` /
   `components/FileViewer/` / `components/ProcessingStatus/` directories,
   matching the existing one-directory-per-component convention (
   `components/LayerViewer/`, `components/Model3D/`, etc.)? — Recommend
   matching the existing convention (one top-level directory per
   component) rather than introducing a new grouping pattern this repo
   doesn't otherwise use.

## 7. Scale assessment

**Medium-large.** Four real, mostly-independent streams (3a nav/IA, 3b
video controls + sample content, 3c display mode + pipeline docs, 3d file
components), one genuine cross-cutting risk (3d's scope-boundary
discipline) and one genuine cross-page-surface change (3a). Proceeding to
story decomposition with vertical slices per stream, matching this
session's established pattern for epics at this scale.
