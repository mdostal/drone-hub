# Horizontal Plan — `<VideoTour>`

Layers this epic touches, in dependency order:

1. **App-shell infra** — `next.config.*`, `tsconfig.json`, Tailwind/PostCSS
   config, root `app/layout.tsx`. Nothing else can run without this; currently
   zero of it exists.
2. **Gating middleware** — Next.js `middleware.ts` passcode check, per
   CLAUDE.md's hard rule. Depends on (1). Nothing property-specific renders
   without this being real, per the design discussion's resolved open question.
3. **Tour data layer** — `tour.json` manifest for 2806 Prado + extracted
   room-still assets under `public/tours/2806-prado/`. Depends on (1) only
   (static assets, no runtime dependency on gating). `lib/tour-types.ts`
   already exists; may need a small loader/parse helper (`manifest: url | Tour`
   per `VideoTourProps` — the component must accept either).
4. **Component layer** — `<VideoTour>`, `<TourStage>`, `<DoorwayControls>`,
   `<FloorPlanMap>`, the state machine (render/go/busy-guard), neighbor
   preloading. Depends on (3) for the data shape, (1) for the app it mounts
   into. Independent of (2) — the component itself is gate-agnostic by design.
5. **Test layer** — Vitest + React Testing Library setup (first test
   infrastructure in this repo), BDD behavior specs for the component
   build-out, TDD unit specs for the state-machine logic (busy-guard,
   preload-neighbor selection) per `hive.config.yaml`'s methodology note.
   Depends on (4) existing to test against, but the Vitest *setup itself* can
   land as soon as (1) exists.
6. **Integration** — a real gated route (`app/tours/[slug]/page.tsx` or
   similar) that mounts `<VideoTour>` behind middleware (2) against the real
   manifest (3), wrapped in `next/dynamic({ssr:false})` per CLAUDE.md.

## Cross-layer dependencies

```
app-shell infra ──┬──> gating middleware ──────────────┐
                   ├──> tour data layer ──> component ──┴──> integration
                   └──> test-layer setup ──> component tests
```

Gating and the data layer are independent of each other and of the component
layer's internals — they can be built in either order once the app shell
exists. The component layer needs the data *shape* (types + a real manifest to
develop against) but not gating. Integration is the only slice that needs
everything.
