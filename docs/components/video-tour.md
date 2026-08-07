# `<VideoTour>` — interactive fly-through tour (hive spec)

> A **video-Matterport**: click a room → the drone flies to it and spins → you're "in" it,
> with clickable doorways to adjacent rooms + a floor-plan minimap. Branching video on a
> **room graph**. Plug-and-play, importable into personal-site, gated on drone.mdostal.com.

**Reference build target (RUN THIS FIRST):** `docs/components/reference/prado-tour.prototype.html`
— a working, self-contained prototype (real 2806 Prado room stills, live click-through
navigation, floor-plan map, transition wipes). Also published: https://claude.ai/code/artifact/d6ece8ff-94d7-4ea3-bec6-2c5707ee6015
The prototype IS the spec — match its UX, then swap stills → real clips and mocked wipes → real transition videos.

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
- [ ] Loads a `Tour` manifest; renders nodes with spin-clip OR still fallback.
- [ ] Doorway + minimap navigation with transition-clip OR wipe fallback; no double-fire (`busy`).
- [ ] Neighbor preloading; smooth on mobile (Mathew reviews on his phone).
- [ ] Floor-plan minimap: positions, edges, current-room highlight, clickable.
- [ ] Importable into personal-site; renders behind the drone gate; passes `pnpm build`.
- [ ] Prototype parity: a stranger can navigate the Prado house with zero instructions.

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
