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
  Verified: `VideoTour.tsx` fetches a manifest URL (or accepts a `Tour` object directly); `TourStage.tsx` renders `room.spin` as a looping muted video when set, else `room.still` with the Ken-Burns treatment. Covered by `VideoTour.test.tsx` ("initial render") and `TourStage.test.tsx`.
- [x] Doorway + minimap navigation with transition-clip OR wipe fallback; no double-fire (`busy`).
  Verified: `VideoTour.tsx`'s `go()` plays `edge.clip` full-frame when set, else the timed "flying to X…" wipe; a `busyRef` (not just React state, to catch same-tick re-clicks) blocks re-entrant navigation until the wipe/clip finishes plus a cooldown. Covered by `VideoTour.test.tsx`'s "doorway navigation" busy-guard test, `DoorwayControls.test.tsx`, and `FloorPlanMap.test.tsx`. Note: the transition-clip branch itself is P2-structural — no manifest edge sets a real `clip` yet, so it's exercised only by "doesn't throw" smoke tests, not real clip playback.
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
