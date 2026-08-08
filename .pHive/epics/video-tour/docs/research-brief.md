# Research Brief — `<VideoTour>`

## Codebase state (as of 2026-08-07)

- **No app shell exists yet.** No `next.config.*`, `tsconfig.json`, `tailwind.config.*`,
  `postcss.config.*`, `app/` or `pages/` directory, no `node_modules/` (deps never
  installed). `package.json` declares Next 15 / React 19 / Tailwind 4 / shadcn plus
  the full component-library dep set (maplibre-gl, three, hls.js, etc.) but none are
  wired into a running app.
- **`components/` and `scripts/` are empty directories** (git-tracked as scaffolding,
  zero files).
- **`lib/tour-types.ts`** (57 lines) is the only real source file. It defines
  `TourEdge`, `TourRoom`, `Tour`, `RoomChangeHandler`, `VideoTourProps` — a directed
  room graph with explicit null-fallback fields (`spin`/`clip` → `still`/wipe).
- **`docs/components/video-tour.md`** is the full component spec (acceptance
  criteria, state machine, authoring flow, phase fit).
- **`docs/components/reference/prado-tour.prototype.html`** is a working,
  self-contained vanilla-JS/HTML prototype seeded with 6 real rooms from 2806 Prado
  (front, living, kitchen, great, bedroom, bath). Read in full (data URIs stripped
  for inspection) — its `render()`/`go()` functions are the literal state machine
  the spec describes:
  - `render(id)`: swaps in a `<video>` (if `spin` set, autoplay/loop/muted/playsInline)
    or `<img>` (if not, `.live` class drives a 14s Ken-Burns `scale`+`translate`
    keyframe as the placeholder); sets the caption; rebuilds doorway buttons from
    `neighbors[]`; toggles `.here` on the matching minimap node.
  - `go(neighbor)`: guarded by a `busy` flag (drops the click if already navigating);
    shows a "flying to {label}…" overlay; if the edge has a `clip`, plays it
    full-frame and waits for `onended` before arriving; otherwise a fixed ~900ms
    timed wipe substitutes for the missing transition clip.
  - Floor-plan minimap: absolutely-positioned `.node` divs at `pos:[x%,y%]`, click
    dispatches the same `go()` path as a doorway button.
  - **No neighbor preloading in the prototype** — the spec's acceptance criteria
    calls for it ("Neighbor preloading; smooth on mobile") but the reference
    implementation does not demonstrate it. This is real component work, not a
    port.
  - No gating/passcode logic in the prototype (out of scope for a static HTML demo)
    — that's an app-shell concern (CLAUDE.md: "served behind the existing drone
    passcode/middleware").
- **No test infrastructure, no linter config, no CI** — confirmed at kickoff
  (`.pHive/project-profile.yaml`).
- **Rights/privacy hard rules** (CLAUDE.md): footage stays gated until release forms
  are signed; owner PII never stored/shown; `family-reunion-aerial` clip never used.
  None of these block `<VideoTour>` itself (it renders whatever manifest it's given)
  but the **consuming app** (gating middleware, which properties are public) must
  respect them — flagged as a dependency, not a `<VideoTour>` responsibility.

## What this means for planning

1. **This epic must stand up the Next.js app shell** (config files + a minimal
   `app/` route to host `<VideoTour>`) — it can't be assumed to pre-exist.
2. **The prototype supplies the state-machine logic almost verbatim** — the main
   *new* engineering is: React/TypeScript port, `hls.js`-backed video (prototype
   uses raw `<video src>`), neighbor preloading (not in the prototype), and the
   `next/dynamic({ssr:false})` wrapping convention CLAUDE.md mandates for heavy
   viewers.
3. **Gating is a real dependency** but is app-shell/middleware work, not internal
   to `<VideoTour>` — the component takes a `gated?: boolean` on the manifest and
   trusts the caller to have already gated access; it doesn't implement auth itself.
4. **No test framework is chosen yet.** BDD methodology (per `hive.config.yaml`)
   needs one picked as part of this epic (Vitest + Testing Library fits the
   Next15/React19/TS stack with no extra runtime weight).
