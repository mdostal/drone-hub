# Design Discussion — `<VideoTour>`

## 0. Prelude

**NORTH STAR** (from `.pHive/project-profile.yaml`)
- Goal: ship plug-and-play components importable into mdostal.com, not one app page.
- Audience: Mathew, solo — personal/gated today.
- Scale: no architectural split between component-library scale and app scale;
  build local-first, layer in external streaming incrementally; raise
  scale-affecting architecture calls individually.
- Pain points: Phase-0 capture gap, no-RTK drift, WebODM compute, Vercel bandwidth.

No prior KG decisions found for this topic (first epic in a fresh project).

## 1. Goal

Ship `<VideoTour>` — an interactive fly-through "video-Matterport" room-graph tour
— as the first plug-and-play component in drone-hub, seeded with the real 2806
Prado house, matching the UX of the existing reference prototype exactly. This is
explicitly **not** the map/3D components (`<LayerViewer>`/`<Model3D>`), which stay
queued behind the Phase-0 nadir grid pass.

## 2. Proposed approach

**Stand up the app shell + port the prototype's proven state machine into typed
React, in that order — don't design a new interaction model.**

The prototype (`docs/components/reference/prado-tour.prototype.html`) already
answers every UX question: render-current-node, doorway/minimap navigation with a
`busy` guard, clip-or-wipe transitions, Ken-Burns still fallback. Read in full,
its `render()`/`go()` pair is ~40 lines of vanilla JS. The job is:

1. **Scaffold the Next.js app shell** (`next.config`, `tsconfig.json`, Tailwind/
   PostCSS config, a minimal `app/` route) — currently absent entirely.
2. **Port the state machine into `<VideoTour>` + subcomponents** (`<TourStage>`,
   `<DoorwayControls>`, `<FloorPlanMap>`) per `lib/tour-types.ts`, matching the
   prototype's behavior 1:1, then add the one thing the prototype *doesn't* do
   that's in scope for P1: neighbor preloading (spin + outgoing-transition
   clip/still URLs of the current node's immediate neighbors, per the spec's
   acceptance criteria). `hls.js`-backed adaptive playback is **deferred to P2**
   — P1 ships stills + wipes only (no real spin/transition clips yet), so there
   is nothing for `hls.js` to adaptively stream; wiring it now would be
   speculative. Revisit when real clips exist.
3. **Seed the Prado manifest as `tour.json`**, reusing the prototype's 6-room
   graph and stills (the prototype's embedded data URIs need to become real
   asset references — see Open Questions).
4. **Wrap in `next/dynamic({ssr:false})`** per CLAUDE.md's heavy-viewer convention.
5. **Build minimal gating middleware as part of this epic.** No passcode/gating
   convention exists anywhere in drone-hub yet (confirmed in the research brief
   — only the separate personal-site has one). CLAUDE.md's hard rule ("never
   deploy un-released assets un-gated") and the fact that 2806 Prado is a real,
   currently-live address mean this can't be treated as pre-existing
   infrastructure to hook into — it has to be built. `<VideoTour>` itself stays
   gate-agnostic (`gated?: boolean` on the manifest); the app-shell middleware
   is what actually enforces the passcode.

This keeps the component honest to its own spec ("the prototype IS the spec")
while doing the real engineering the prototype skips: types, tests, preloading,
adaptive video, and the app shell it needs to run in at all.

## 3. Scale assessment

**Medium.** Multiple layers (app-shell infra, component layer, typed data layer,
test layer) and multiple files, but bounded in scope (one component family, one
seeded property, P1 phase = stills + wipes only — no real spin/transition clips
required yet per the spec's phase fit). Not Small (more than 1-3 files / a single
layer).

Grill flagged that this epic also bootstraps the *entire* app shell and the
project's first test framework — precedent-setting work, not just "port a
component." Weighed against Large: there's no migration, no multi-system
integration, and no long delivery horizon — the app shell being scaffolded is a
handful of standard config files (`next.config`, `tsconfig.json`, Tailwind/
PostCSS), not a bespoke system. The precedent-setting nature argues for care in
execution (get the app-shell conventions right the first time), not for the
heavier Large-scope ceremony (structured outline, elicitation). Staying at
Medium — H/V slice planning applies, structured outline does not.

## 4. Risks

- **Asset sourcing for `tour.json`.** The prototype embeds room stills as inline
  data URIs. The real component needs them as addressable assets (R2 per
  CLAUDE.md, or local `public/` for this P1 pass before R2 wiring exists). Needs
  an explicit decision, not an assumption — flagged as an open question below.
- **No test framework chosen yet.** BDD methodology requires one. Recommending
  Vitest + Testing Library (zero extra runtime weight, standard for Next15/
  React19/TS) but this is a real decision, not a formality.
- **Neighbor preloading is unproven** — the prototype doesn't implement it, so
  there's no reference behavior to port; it has to be designed fresh against the
  acceptance criterion ("Neighbor preloading; smooth on mobile").
- **Gating dependency.** `<VideoTour>` assumes the app shell already gates access
  before the component ever mounts. If the app-shell gating middleware isn't part
  of this epic's own scope, this is a real external dependency this epic doesn't
  control end-to-end — need to decide whether minimal gating middleware belongs
  in this epic or is deferred.
- **Rights/privacy hard rules are app-shell/data concerns, not component
  concerns** — `<VideoTour>` will happily render any manifest it's given. Nothing
  in the component itself enforces "never deploy un-released assets un-gated" —
  that enforcement lives in whatever publishes a `tour.json` to a public URL.
  Noting this so it isn't silently assumed to be handled.

## 5. Dependencies

- Phase-0 nadir grid pass: **none** — `<VideoTour>` is explicitly unblocked and
  doesn't touch ortho/DSM/mesh data.
- `hls.js` (already a locked dependency in `package.json`, unused so far).
- Cloudflare R2 for real asset hosting — **deferred**; P1 can ship against local/
  `public/` assets first per the north-star scale principle (local-first, add
  external streaming incrementally, raise the R2-wiring decision separately when
  it's actually needed). **Explicit boundary:** the switch to R2 (and to
  `hls.js`) happens no later than when P2 introduces real spin/transition video
  clips — local `public/` assets are a P1-only, stills-scale convenience, not a
  standing convention to carry forward by inertia.

## 6. Open questions

Resolved directly (see §2/§5 above for the reasoning):
- **Asset source for P1** → `public/tours/2806-prado/`, with an explicit boundary
  to switch to R2 no later than P2's real video clips.
- **Test framework** → Vitest + React Testing Library.
- **Gating middleware** → in scope for this epic (built, not assumed).
- **`hls.js`** → deferred to P2 (nothing to adaptively stream in a stills-only P1).

Resolved (2026-08-07, operator decision):

1. **"2806 Prado" as title/slug/folder** → **keep as-is.** Confirmed acceptable:
   it's gated, it's Mathew's own address, and the property is being sold — the
   footage/photos are historical record of a property he no longer owns going
   forward, not an ongoing PII exposure of someone else's home.
2. **Doorway button labels** — P1 ships without ever using the `label` override
   (no manifest data needs it); confirmed fine, not a blocker.

Design discussion **signed off** — proceeding to H/V slice planning.
