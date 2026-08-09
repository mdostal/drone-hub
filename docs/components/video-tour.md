# `<VideoTour>` — interactive fly-through tour (hive spec)

> A **video-Matterport**: click a room → the drone flies to it and spins → you're "in" it,
> with clickable doorways to adjacent rooms + a floor-plan minimap. Branching video on a
> **room graph**. Plug-and-play, importable into any app.

**Update (operator, 2026-08-08):** drone-hub carries no gating of any kind, and no real
property footage — the real `2806-prado` tour (referenced throughout this doc, including
the prototype below) was removed from this repo entirely; that content and its access
control now live exclusively in the separate, private `personal-drone` platform. Every
reference below to `middleware.ts`, `lib/gate.ts`, a passcode gate, or `/tours/[slug]`
describes an architecture that no longer exists here — kept as historical record. The
component itself is demonstrated at the public `/components/video-tour` showcase page
against fully synthetic sample data (`public/showcase-samples/demo-house/`).

**Reference build target (historical — file removed 2026-08-08):**
`docs/components/reference/prado-tour.prototype.html` was the original working prototype
this component was built to match — it embedded real, un-released 2806 Prado room photos
as base64 image data, so it was deleted along with the rest of this repo's real-content
removal (see the Update note above). `<VideoTour>` was already fully built against it;
nothing here depends on the file still existing. **Flagged for operator follow-up, not
fixable from this repo:** this doc also referenced a claude.ai artifact URL
(`https://claude.ai/code/artifact/d6ece8ff-...`) as "also published" — if that artifact
contains the same embedded photos, it's a separate exposure surface this repo's fix
doesn't touch; worth checking/revoking directly on claude.ai.

## Why (operator intent — honor this)
This is Mathew's **own** cinematic layer over the space — NOT the MLS listing, NOT for-hire
work. He already has a Matterport for the accurate dollhouse; this is the *motion* version
that lives on **his** site as a portfolio/showcase piece and reusable component. Build it as
a general property-tour component, seeded with the Prado house.

## The model — a room graph (reuse the prototype's shape)
See `lib/tour-types.ts`. A tour is `nodes` (rooms) + `edges` (doorways):

- **Node (room)** = a looping **spin clip** (drone rotating in the room). Falls back to a
  **still** when no clip is set (so a tour is publishable before every clip is cut).
- **Edge (doorway)** = a **transition clip** (drone flying *from this room to that one*).
  Directional. Falls back to a timed cross-fade wipe when no clip is set.
- **Minimap** = floor-plan node positions (`pos:[x%,y%]`) + edges drawn between them; current
  room highlighted; nodes are clickable = jump (plays the transition if one exists).

Authoring a new property = write one `tour.json` manifest + drop the clips on R2. No code.

### Real spin-video controls + sample clip provenance (`videotour-real-controls-and-sample-clip`, 2026-08-09)

**Spin video only, never the transition clip — the scope line is load-bearing, not a
style choice.** `VideoTour.go()`'s only path to `arrive()` (which clears `busyRef`/
`busy`, un-disabling every `DoorwayControls`/`FloorPlanMap` button) is `TourStage`'s
`onTransitionClipEnded` firing on the transition clip's `'ended'` event. If a visitor
could pause that clip, or scrub it backward off the end, `'ended'` would never fire,
`arrive()` would never run, and the tour would permanently lock up with no escape
hatch anywhere in the current code. The `spin` video has no such dependency — nothing
in the navigation state machine waits on it — so it's safe to give real controls.
`TourStage.tsx`'s `<SpinVideo>` now renders a themed on-video controls bar (play/pause,
a scrub/seek `<input type="range">` bound to `currentTime`/`duration` via a
`timeupdate`/`loadedmetadata` listener, a mute/unmute toggle, and 0.5x/1x/1.5x/2x
speed buttons bound to `video.playbackRate`) — styled with this repo's design tokens
(`bg-surface`/`border-border`/`text-accent`/`text-foreground` from `app/globals.css`),
matching `Model3D`'s/`VoxelTerrain`'s on-canvas legend-panel visual language. The video
still autoplays muted on arrival by default (unregressed silent-loop behavior for
anyone who doesn't touch the controls) — the controls only add the *ability* to pause,
scrub, unmute, and change speed, they don't change the default. The transition-clip
`<video>` (see the behavior list below) is deliberately untouched: still autoplay,
muted, no controls, `onEnded` the only path to `arrive()`.

**Sample clip provenance (`public/showcase-samples/demo-house/living-spin.mp4`):**
every room's `spin` field was `null` in this manifest before this story — the spin
code path had never actually rendered. A real, correctly-licensed public clip was
sourced (same category of research as `layer-viewer.md`'s ortho-sourcing search) —
this repo had zero video-encoding tooling before this story (`ffmpeg` not a project
dependency; confirmed via `grep -i ffmpeg package.json` returning nothing), so the
synthetic-fallback path was budgeted for but not needed once a suitable clip turned
up. Source: [**"Slow motion ceiling fan"**](https://commons.wikimedia.org/wiki/File:Slow_motion_ceiling_fan.webm)
by GolhaMedia, via Wikimedia Commons, licensed
[**CC BY-SA 4.0**](https://creativecommons.org/licenses/by-sa/4.0/) — a real, static-camera
interior shot of a ceiling fan spinning, genuinely plausible as an ambient "room spin"
placeholder (unlike a thematically-unrelated clip, which was the other real PD
candidate found during the search — a NASA/SVS eclipse-glasses demonstration video,
public domain but with no interior/room framing at all). **Derivative work, shipped
under the same license**, per CC BY-SA's share-alike term: the original 49s/800×450
WebM was trimmed to a 5-second static-camera segment (`ffmpeg -ss 6 -t 5`, installed
locally via `brew install ffmpeg` for this one-time edit — not a project dependency,
same "pipeline tools live outside the bundle" convention as `layer-viewer.md`'s
`scikit-image` note), downscaled to 640×360, re-encoded to H.264 baseline MP4 (silent —
the audio track was dropped; the player is muted by default regardless), and a
burned-in caption ("DEMO — stock footage, not the actual room") was composited on top
via `ffmpeg`'s `overlay` filter (this build of `ffmpeg` has no `drawtext`/`libfreetype`
support, so the caption was rendered as a transparent PNG with Pillow and overlaid as a
video filter instead) — both because it's genuinely unrelated content standing in for
a room (unlike the ortho photo, which is real aerial imagery of *an* outdoor space),
and to match the demo-house SVG stills' own "DEMO — fictional room, not a real
property" disclaimer convention. Final file: ~109 KiB, assigned to the Living Room
(`rooms[1].spin` in `tour.json`) — the only room with a non-null `spin` value; every
other room, and every edge's `clip`, remains `null`. Re-distributing or further
modifying `living-spin.mp4` must keep the CC BY-SA 4.0 license + attribution to
GolhaMedia intact, per the license's own terms.

> **Implementation note (deviation from this section's wording):** the shipped
> `Tour` type (`lib/tour-types.ts`) doesn't have a top-level `edges` array — it's
> an adjacency list: `Tour.rooms: TourRoom[]`, and each room carries its own
> outgoing doorways as `TourRoom.neighbors: TourEdge[]`. Same graph, same
> per-edge shape (`{ to, clip, label? }`); just nested under the room rather
> than a parallel list. Decided during `video-tour-prado-manifest` — see
> `public/tours/2806-prado/tour.json` for a real example.

## Behavior (state machine — as in the prototype)
1. Render current node: `spin` clip looping (muted, `playsInline`) OR the still with a slow
   Ken-Burns as the placeholder.
2. Show a **doorway button** per edge (`→ Kitchen`) + sync the minimap highlight.
3. On doorway/minimap click → if `busy` ignore; set `busy`; if the edge has a `clip`, play it
   full-frame then arrive; else show the "flying to X…" wipe (~900ms) then arrive. Arrive =
   render the target node, clear `busy`.
4. Preload the spin + outgoing-transition clips of the **current node's neighbors** (snappy hops).

## Tech (fit the existing stack — see root `CLAUDE.md` / `package.json`)
- **Next.js 15 · React · Tailwind · shadcn**, heavy player `next/dynamic({ssr:false})`.
- Video: **`hls.js`** (already a dep) for adaptive playback of large clips; short clips can be
  progressive MP4. Host on **Cloudflare R2 / Stream** (zero-egress; NOT Vercel bandwidth).
  *(Not yet true: `TourStage.tsx` ships plain `<video>` tags for the P2 spin/transition
  branches, no `hls.js` wiring. Deferred to P2 along with the real clips it would serve —
  there's nothing adaptive to stream until real spin/transition footage exists.)*
- No new heavy deps required. Minimap = SVG/CSS (no map lib needed — it's a schematic, not geo).
- Component API: `<VideoTour manifest={url|Tour} startNode? poster? onRoomChange? />`.
  Subcomponents: `<TourStage>` (player), `<DoorwayControls>`, `<FloorPlanMap>`.
- **Gated**: served behind the existing drone passcode/middleware; assets private until Mathew
  flips a tour to public (nothing goes live until he says so).

## Authoring flow (what Mathew does per house)
1. Fly/cut clips: one **spin** per room + one **transition** per doorway direction he wants.
2. Upload to R2 under `tours/<slug>/`.
3. Fill `tour.json` (nodes/edges/still fallbacks/minimap positions). Publish → gated URL.
   Stills alone = a valid tour; clips upgrade it incrementally.

## Acceptance criteria
- [x] Loads a `Tour` manifest; renders nodes with spin-clip OR still fallback.
  Verified: `VideoTour.tsx` fetches a manifest URL (or accepts a `Tour` object directly); `TourStage.tsx` renders `room.spin` as a looping muted video (with a real, themed play/pause/scrub/speed controls bar — `<SpinVideo>`, added by `videotour-real-controls-and-sample-clip`) when set, else `room.still` with the Ken-Burns treatment. Covered by `VideoTour.test.tsx` ("initial render") and `TourStage.test.tsx`. **Update, 2026-08-09:** this branch is no longer smoke-tested-only for `spin` — `public/showcase-samples/demo-house/tour.json`'s Living Room now sets a real `spin` clip (`living-spin.mp4`, provenance above), and the controls bar is unit-tested (play/pause toggling on real `'play'`/`'pause'` events, mute toggling, seek-slider → `currentTime`, speed buttons → `playbackRate`) plus live-Playwright-verified against a real `next build && next start` server.
- [x] Doorway + minimap navigation with transition-clip OR wipe fallback; no double-fire (`busy`).
  Verified: `VideoTour.tsx`'s `go()` plays `edge.clip` full-frame when set, else the timed "flying to X…" wipe; a `busyRef` (not just React state, to catch same-tick re-clicks) blocks re-entrant navigation until the wipe/clip finishes plus a cooldown. Covered by `VideoTour.test.tsx`'s "doorway navigation" busy-guard test, `DoorwayControls.test.tsx`, and `FloorPlanMap.test.tsx`. **Still accurate as of 2026-08-09 — unchanged by `videotour-real-controls-and-sample-clip`, by design:** the transition-clip branch remains P2-structural and uncontrolled — no manifest edge sets a real `clip` yet, so it's exercised only by "doesn't throw" smoke tests, not real clip playback, and it deliberately received NO user controls (see the "Real spin-video controls" section above for the deadlock-risk reasoning: the transition clip's `'ended'` event is the only path to `arrive()`, so pause/scrub control there without a real `'ended'`-independent fallback is a genuine, shippable deadlock — out of scope for that story, not an oversight here).
- [ ] Neighbor preloading; smooth on mobile (Mathew reviews on his phone).
  Preloading is implemented and thoroughly tested: `useNeighborPreload.ts` preloads direct (1-hop) neighbors' media on every arrival, priority `edge.clip → neighbor.spin → neighbor.still`, no recursive/2-hop preloading (`useNeighborPreload.test.ts`, 9 specs). Left unchecked because the "smooth on mobile" half of this criterion is literally an on-device pass on Mathew's phone — that hasn't happened, and there's no automated substitute for it in this verification pass.
- [x] Floor-plan minimap: positions, edges, current-room highlight, clickable.
  Verified: `FloorPlanMap.tsx` renders one node per room at `room.pos`, deduped connecting lines between neighbors, `aria-current` on the current room, and click-to-navigate restricted to rooms actually reachable from here. Covered by `FloorPlanMap.test.tsx` (7 specs) and `VideoTour.test.tsx`'s "minimap" block.
- [x] Importable into personal-site; renders behind the drone gate; passes `npm run build`.
  Verified: `components/VideoTour/index.ts` and everything it transitively imports (`VideoTour.tsx`, `TourStage.tsx`, `DoorwayControls.tsx`, `FloorPlanMap.tsx`, `useNeighborPreload.ts`, `cx.ts`, `lib/tour-types.ts`) contain zero imports from `app/` or `middleware.ts` — see "Importable standalone" below. The real route (`app/tours/[slug]/page.tsx`) sits under `middleware.ts`'s `/tours/:path*` matcher, so it's gated. `npm run build` passes clean. (Corrected from "passes `pnpm build`" — this repo uses npm, see `package-lock.json` and `package.json`'s scripts; there was never a pnpm lockfile here.)
- [x] Prototype parity: a stranger can navigate the Prado house with zero instructions.
  Verified by interaction-pattern parity with `docs/components/reference/prado-tour.prototype.html`: labeled doorway buttons (`→ Kitchen`), a clickable floor-plan minimap with a "here" highlight, and a "flying to X…" transition state — the same self-explanatory affordances as the prototype, wired to the real Prado manifest (`public/tours/2806-prado/tour.json`, 6 rooms). No formal usability test with an actual stranger was run; this is inferred from UI/interaction equivalence, not observed firsthand.

### Importable standalone — audit finding
Walked `components/VideoTour/index.ts`'s full export surface (`VideoTour`,
`TourStage`, `DoorwayControls`, `FloorPlanMap`, plus the `lib/tour-types.ts`
types) and every file it transitively imports. Clean: nothing pulls from
`app/`, `middleware.ts`, or `lib/gate.ts`. `VideoTour.tsx` explicitly documents
this as a design intent ("Gate-agnostic by design — this component has no
knowledge of middleware.ts / lib/gate.ts. It just renders whatever manifest
it's given.") and the code matches the claim. `useNeighborPreload.ts` and
`cx.ts` exist under `components/VideoTour/` but are internal-only (not
re-exported from `index.ts`) — fine, since nothing outside the family needs
them directly. The "plug-and-play" bar from `CLAUDE.md` holds.

## Phase fit
- **P1 (this component):** stills + wipes working end-to-end on the Prado manifest (ship-able now
  from the frames already captured).
- **P2:** real spin + transition clips swapped in as Mathew cuts them from Flight-2 footage.
- **P3:** polish — audio bed, "auto-play tour" mode, deep-link to a room (`#kitchen`), analytics.

## Companion footage components (same family — separate specs later)
Mathew wants the surrounding tooling to make footage **easy to upload + interact with**:
- **`<FootageUploader>` / ingest** — drop clips → R2 → auto-thumbnail + register in a manifest
  (feeds VideoTour, Gallery, VideoAnnotator). Some inputs come from **WebODM** outputs
  (ortho/mesh) for the map/3D components, video from the raw flights.
- Ties into existing planned `<LayerViewer>`, `<Model3D>`, `<VideoAnnotator>`, `<Gallery>`.
Keep VideoTour standalone but manifest-compatible so one property folder feeds all of them.
