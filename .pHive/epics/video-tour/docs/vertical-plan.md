# Vertical Plan — `<VideoTour>`

Each slice below leaves drone-hub in a genuinely working, demonstrable state.
Slices execute sequentially; stories within a slice may run in parallel where
noted. This maps directly to `.pHive/epics/video-tour/stories/`.

## Slice 1 — App shell boots, gated
**Proves:** the project can run at all, and the gating hard-rule is real
infrastructure, not a promise.
- Scaffold `next.config.*`, `tsconfig.json`, Tailwind/PostCSS config,
  `app/layout.tsx`, a placeholder `app/page.tsx`.
- Build passcode gating middleware (`middleware.ts`).
- Working state: `npm run dev` boots; hitting any route without the passcode
  is blocked; with it, a placeholder page renders.

## Slice 2 — Real tour data
**Proves:** the Prado tour has an addressable, typed manifest and real assets.
- Extract the prototype's 6 embedded room stills to
  `public/tours/2806-prado/*.jpg` (or similar).
- Write `tour.json` (or a `.ts` const, per `VideoTourProps.manifest: Tour |
  string` — needs a decision on which for P1) reproducing the prototype's
  6-room graph (front/living/kitchen/great/bedroom/bath), all `spin: null`,
  `clip: null` (stills + wipes only, per P1 scope).
- Working state: the manifest validates against `lib/tour-types.ts`'s `Tour`
  interface; assets load by URL.

## Slice 3 — `<VideoTour>` core, prototype UX parity
**Proves:** the acceptance bar — "a stranger can navigate the Prado house with
zero instructions" — is met in React, matching the prototype.
- `<TourStage>`: current-node render (still + Ken-Burns fallback per the
  prototype's `.live` animation; spin-clip branch stubbed since P1 has no
  clips), caption, transition wipe overlay.
- `<DoorwayControls>`: doorway buttons from `room.neighbors`, directional
  labels.
- `<FloorPlanMap>`: minimap nodes at `pos:[x%,y%]`, edges, current-room
  highlight, click-to-navigate.
- `<VideoTour>`: wires the three together, owns `cur`/`busy` state, the
  `go(edge)` transition (wipe-only in P1 — no real clips to branch on yet),
  `startRoom`/`onRoomChange` props.
- Mounted on a real gated route (`app/tours/[slug]/page.tsx`), wrapped in
  `next/dynamic({ssr:false})`.
- Working state: a stranger can click through all 6 Prado rooms via doorways
  or the minimap, on the actual gated URL, matching the prototype's UX.

## Slice 4 — Preloading + test coverage
**Proves:** the two things the prototype didn't demonstrate are real: neighbor
preloading and verified behavior.
- Preload the current node's neighbor stills (P1 has no clips to preload yet,
  but the mechanism must exist and extend cleanly to spin/transition clips in
  P2).
- Vitest + React Testing Library setup (first test infra in this repo).
- BDD specs for full component behavior (render, navigate, busy-guard,
  minimap sync) per acceptance criteria.
- TDD specs for the state-machine logic in isolation (busy-guard no-double-fire,
  neighbor-selection for preload) — the "complex logic units" called out in
  `hive.config.yaml`.
- Working state: `npm test` runs and passes; the acceptance criteria checklist
  in `docs/components/video-tour.md` is verifiably met, not just eyeballed.

## Slice 5 — Docs + acceptance close-out
**Proves:** the spec and the shipped component agree, and importability is real.
- Reconcile `docs/components/video-tour.md` with any implementation deviations
  (documentation cross-cutting concern).
- Confirm the component is cleanly importable (the "plug-and-play" bar) —
  verify no drone-hub-app-specific coupling leaked into `<VideoTour>` itself.
- `npm run build` passes.
- Working state: every checkbox in the spec's Acceptance Criteria is checked
  and verifiably true.

## Deferred (explicitly out of this epic)
- `hls.js` adaptive playback, real spin/transition clips, Cloudflare R2 asset
  hosting — P2, once real clips exist (per design discussion §5 boundary).
- `<LayerViewer>` / `<Model3D>` — queued behind the Phase-0 nadir grid pass,
  not part of this epic at all.
