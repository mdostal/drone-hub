# Content engine — the `/properties/[slug]/engine` page (hive spec)

> **This is not a new plug-and-play component.** It's a per-property *page* that
> composes `<VoxelTerrain>`/`<VoxelStructure>` (see `docs/components/voxel-terrain.md`,
> which this doc assumes) alongside two sample-content panels — "engineering" and
> "flight log." The operator's own framing, verbatim: "the content engine where I let
> people see the engineering, the minecraft of it, the flight docs."

**Update (operator, 2026-08-08):** the `/properties/*` passcode gate this doc originally
described has been removed entirely — drone-hub carries no gating of any kind now (see
CLAUDE.md's "Scope boundary" correction of the same date). Every reference below to
`middleware.ts`, `lib/gate.ts`, or a passcode gate describes an architecture that no
longer exists in this repo; kept as historical record of why this page's data flow was
originally designed the way it was, not as a description of current behavior. This page
was always synthetic sample data only, so removing the gate changed nothing about what's
actually shown here — just who can reach it (now: anyone, same as every other page).

**Design discussion (RESOLVED architecture — read first):**
`.pHive/epics/minecraft-content-engine/docs/design-discussion.md`, point 5 (the
per-slug resolution mechanism) and point 6 (`FlightLogEntry`'s scope) — this doc explains
those decisions for a maintainer, it does not re-derive them.

## Where it lives, and what it's gated by

`app/properties/[slug]/engine/page.tsx` — nested under the **existing**
`/properties/:path*` gate prefix already registered in `lib/gate.ts`'s
`GATED_PATH_PREFIXES` and `middleware.ts`'s matcher (added in the layer-viewer epic's
`layer-viewer-gating-extension` story). This page adds **zero** new gating logic of its
own: no passcode/session code lives in `page.tsx`, `EnginePageClient.tsx`, or
`VoxelScene.tsx` — middleware enforces the gate server-side before the page is ever
reached, the same "gating is applied at the route/middleware layer, not inside
components/pages" discipline every gated route in this repo follows. Unauthenticated
access to `/properties/<any-slug>/engine` redirects to
`/enter-passcode?next=/properties/<any-slug>/engine`.

`page.tsx` is a **Server Component**, not a client component — unlike its sibling
`app/properties/[slug]/page.tsx` (which is `"use client"` + `useParams`, purely so it can
call `next/dynamic({ ssr: false })` directly). This page needs to synchronously check
whether real per-slug files exist on the server filesystem and read them — a Node `fs`
operation, only legal in a Server Component. Since Next's App Router rejects
`ssr: false` on a `next/dynamic` call made directly inside a Server Component,
`EnginePageClient.tsx` is the `"use client"` boundary that owns the actual
`next/dynamic(() => import("./VoxelScene"), { ssr: false })` call for the heavy WebGL
viewer — `page.tsx` does the server-side data resolution and hands the resolved
props down.

## The per-slug real-vs-fallback resolution mechanism — the least obvious, most important part

**Read this section carefully — it's the actual fix a grill review forced into this
epic's design, and it's easy to misdescribe as "just show sample data" if you haven't
read `lib/content-engine-resolution.ts` directly.**

### The problem it fixes

The original draft of this page would have shown **identical, hardcoded sample content on
every property's `/engine` page, forever** — no path to real per-property data ever
existing, and no way for a visitor to tell "this property genuinely has no records yet"
apart from "this is generic demo content, indistinguishable from every other property's
page." A second, related problem: the sample terrain `<VoxelTerrain>` renders is the
*exact same* grid the public, ungated `/components/voxel-terrain` showcase page already
displays — showing that identical content behind a passcode gate, with no signal that
it's the same public demo data, would misleadingly imply an exclusivity that doesn't
exist.

### The fix

`lib/content-engine-resolution.ts` implements a genuine **per-slug lookup with an
explicit, visible fallback**, mirroring conventions already established elsewhere in this
codebase for exactly this shape of problem (`TourEdge.clip: null` → wipe fallback,
`LayerDef.disabled: true` → no render — see `lib/tour-types.ts` / `lib/layer-types.ts`):

```ts
export function resolveContentEngineData(baseDir: string, slug: string): ContentEngineResolution {
  const real = readContentEngineFiles(baseDir, slug);
  const isFallback = real === null;
  const content = real ?? readContentEngineFiles(baseDir, SAMPLE_SLUG);
  return { isFallback, content };
}
```

`readContentEngineFiles(baseDir, slug)` looks for **both**
`<baseDir>/<slug>/engineering.md` **and** `<baseDir>/<slug>/flight-log.json` on disk; it
returns the parsed content only if **both** files exist, and `null` if either is missing.
`resolveContentEngineData` tries the real slug first; if that comes back `null`, it falls
back to the generic dataset at `<baseDir>/sample-house/` (`SAMPLE_SLUG`) instead. The
resulting `isFallback: boolean` is **exactly** the signal
`EnginePageClient.tsx` uses to decide whether to render the visible banner — it is
computed from "did a real per-slug folder actually exist," not hardcoded, not a
constant, and not inferred from anything about the slug string itself (the safety guard
below is a separate, narrower check — see "Path-traversal safety" below).

In production, `page.tsx` calls this with `baseDir = path.join(process.cwd(), "public",
"content-engine")`, so for a real request the actual filesystem layout is:

```
public/content-engine/
├── sample-house/              # the fallback dataset (minecraft-content-engine-data)
│   ├── engineering.md
│   └── flight-log.json
└── <real-slug>/               # only created once real per-property data exists
    ├── engineering.md
    └── flight-log.json
```

Today, **no property has a real `public/content-engine/<slug>/` folder** — every request
currently resolves to the `sample-house` fallback and the banner always renders. That's
expected and correct, not a bug: the mechanism exists so that dropping a real
`public/content-engine/2806-prado/{engineering.md,flight-log.json}` pair in later
transparently switches that one slug over to real content (banner disappears for that
slug only) with **no code change** — the whole point of building the resolution mechanism
now, before any real per-property content exists.

`baseDir` is an explicit parameter on both functions — **never** hardcoded to
`public/content-engine` inside `lib/content-engine-resolution.ts` itself — purely so the
resolution logic is unit-testable against a throwaway fixture directory
(`fs.mkdtempSync`-created, torn down in `afterAll`) without touching the real
`public/` tree. See "Test coverage" below.

### The visible fallback banner

`EnginePageClient.tsx` renders a `role="alert"`, high-contrast, full-width, top-of-page
banner — "Showing sample data — no real records exist yet for this property." — whenever
`isFallback` is true. `role="alert"` matches the same convention `app/enter-passcode/`
and `<LayerViewer>` already use for their own user-facing status messages, so assistive
tech announces it immediately rather than it being silently skippable. This is
deliberately **not** a small footnote: the story's explicit requirement was that the
banner be genuinely visible, because this is the actual fix for the rights/trust concern
above — a gated page silently showing generic public demo content, indistinguishable from
real data, would be misleading even though the stakes are lower than an unreleased asset
leaking publicly.

### What is, and isn't, covered by this resolution

The **engineering notes and flight log** are resolved per-slug as described above. The
**terrain** (`<VoxelTerrain>`/`<VoxelStructure>`, fed from
`public/minecraft-samples/2806-prado/heightmap.json`) is a **separate, deliberately
simpler concern**: it is the *same* sample grid on every slug's `/engine` page,
regardless of `isFallback` — there's no real per-property DSM/heightmap data to fall
back *from* yet (2806 Prado's real photogrammetry pipeline is still blocked on
CLAUDE.md's Phase-0 nadir-pass requirement), so there's no real-vs-fallback distinction
to make for terrain today. `page.tsx`'s own `TERRAIN_SAMPLE_SLUG` constant carries a
comment flagging this explicitly as a known future concern: once real per-property
WebODM/DSM output exists, terrain will need the identical
`resolveContentEngineData`-style per-slug resolution pattern applied to it too — tracked,
not built, here.

## `FlightLogEntry` — deliberately minimal scope

```ts
export interface FlightLogEntry {
  timestampMs: number;   // milliseconds since flight start (or epoch — display-only)
  lat: number;            // latitude, degrees
  lon: number;             // longitude, degrees
  altitudeMeters: number; // altitude above ground/takeoff point, in meters
}
```

That's the whole type — exactly `{timestampMs, lat, lon, altitudeMeters}`, enough to
render the flight-log table/panel this page actually displays (time, position, altitude
columns) and nothing more.

**This was a real, named grill correction, not an incidental design choice — read this
before touching the type.** An earlier draft of this epic designed `FlightLogEntry` with
fields anticipated for a *different, not-yet-planned* future epic: gimbal
pitch/yaw/roll, intended to support that future epic's camera-pose computation for a
telemetry-driven video overlay. Grill flagged this as speculative design, inconsistent
with this project's own established practice — `GeoAnchoredModel`
(`lib/geo-model-types.ts`) was deliberately kept separate from `<Model3D>`'s `ModelDef`
rather than pre-unified for the land-overlay epic's own then-future needs (see
`docs/components/land-overlay.md`), and this project doesn't design a type today to guess
a future epic's requirements — it designs each type against its own current, real
consuming code, and lets the future epic define whatever type *it* actually needs once
it has real requirements to design against.

**The future telemetry-video-overlay epic (queued next per CLAUDE.md's priority order)
will define its own, richer type for its own camera-pose/gimbal needs — it will not
extend or reuse `FlightLogEntry`.** Do not add gimbal/orientation/camera-pose fields to
`FlightLogEntry` for that epic's anticipated benefit, even though it might look like a
natural, low-cost extension once that epic starts — that's precisely the speculative
design this type was corrected away from, and doing it "for later" now would silently
reintroduce the exact mistake grill caught. If a future session is tempted to grow this
type, re-read `.pHive/epics/minecraft-content-engine/docs/design-discussion.md` point 6
and `lib/flight-log-types.ts`'s own header comment first — both say this explicitly.

## Path-traversal safety — `SAFE_SLUG_PATTERN`

```ts
export const SAFE_SLUG_PATTERN = /^[a-zA-Z0-9_-]+$/;
```

`slug` is attacker/user-influenced — it's a URL path segment (`/properties/[slug]/engine`)
— and both `readContentEngineFiles` and (transitively) `resolveContentEngineData` join it
directly into a filesystem path (`path.join(baseDir, slug, "engineering.md")`). Without a
guard, a crafted slug like `../../../../etc` could walk `path.join` outside `baseDir`
entirely. `readContentEngineFiles` checks `SAFE_SLUG_PATTERN.test(slug)` **first**, before
any path is built, and returns `null` — the same "no real content for this slug" result
an ordinary non-matching property slug produces — rather than throwing or attempting the
join at all.

This is framed deliberately as **both** a security guard **and** the semantically correct
behavior, not a bolt-on patch: a slug shaped like a path-traversal attempt can never
correspond to a real property folder name anyway, so treating it identically to "no real
data exists for this slug" (i.e. falling through to the `sample-house` fallback) is the
right behavior on its own terms, independent of the security motivation. The regression
coverage for this (`app/properties/[slug]/engine/page.test.tsx`) asserts both properties
directly: `SAFE_SLUG_PATTERN.test("../../etc")` is `false`, and
`readContentEngineFiles(REAL_CONTENT_ENGINE_DIR, "../../../../etc")` returns `null`
rather than throwing or escaping `baseDir`.

## Test coverage

The resolution logic was **extracted** out of `page.tsx` into
`lib/content-engine-resolution.ts` specifically so it's unit-testable in isolation — a
Server Component doing a synchronous `fs` read isn't itself renderable/callable from a
Vitest+RTL spec, but the plain functions it delegates to are. This is a pure,
behavior-preserving refactor (`page.tsx`'s actual behavior is unchanged, just relocated),
the same "extract pure/testable logic out of what can't be unit-tested directly"
precedent `components/VoxelTerrain/voxel-geometry.ts` follows for the exact same reason
(see `docs/components/voxel-terrain.md`).

`app/properties/[slug]/engine/page.test.tsx` is the regression guard for the exact gap
grill caught during planning — the story's own framing put it at the same weight as the
model3d epic's video-tour rights-regression guard. Two directions, both exercised against
**real** filesystem behavior (nothing mocked out from under the function under test):

1. **Fallback direction**, run against the **real** `public/content-engine/` directory
   (not a fixture), using slug `"2806-prado"` — a precondition assertion first confirms
   `public/content-engine/2806-prado/` genuinely does not exist yet, so the test fails
   loudly instead of silently testing nothing if that ever changes. Asserts
   `isFallback === true` and that the returned content is **byte-for-byte** the real
   `sample-house` files read straight off disk (not just "non-null").
2. **Real-data direction**, using an injectable `baseDir` pointed at a throwaway
   `fs.mkdtempSync` fixture directory (never touches `public/`), containing both a
   `fixture-property/` folder with content **deliberately different** from
   `sample-house`'s real content, and its **own** distinct `sample-house/` stand-in (so a
   resolver bug that ignored `slug` and always fell through to *some* `sample-house`
   folder can't accidentally pass by reading the fixture's own fallback content and
   matching it against itself). Asserts `isFallback === false` and that the returned
   content equals the fixture's real files **and is explicitly not equal to** the
   fixture's own sample-house stand-in — this is what makes the test a genuine regression
   guard: a resolver hardcoded to always return the fallback regardless of slug would
   still produce non-null content, so a same-content-only comparison could not have caught
   it. A third case in the same describe block confirms a different, genuinely-absent
   slug against the *same* fixture directory still falls back correctly — proving the
   resolver is per-slug, not just "always real once a baseDir happens to contain some
   real folder."
3. **Safety-guard coverage**: `SAFE_SLUG_PATTERN` rejecting path-traversal-shaped slugs,
   `readContentEngineFiles` returning `null` (never throwing) for one, and returning
   `null` when only one of the two required files exists (partial data is treated the
   same as no data — a page must never render an engineering panel with no matching
   flight log, or vice versa).

## Usage

Not directly importable — this is a page, not a component. To find it: sign in at
`/enter-passcode`, then visit `/properties/<slug>/engine` (e.g.
`/properties/2806-prado/engine`, which today always shows the fallback banner, since no
real per-slug data exists yet). The page composes:

- `<VoxelScene grid={grid} />` (`app/properties/[slug]/engine/VoxelScene.tsx`) — a thin
  wrapper fixing the `<VoxelTerrain>`/`<VoxelStructure>` composition (structure centered
  at grid cell `(16, 16)` on the 32×32 sample grid) into a single `next/dynamic`
  boundary, so `EnginePageClient.tsx` only needs one dynamic import for the whole scene
  rather than nesting two.
- An "Engineering" panel — the resolved `engineeringMarkdown`, rendered as preformatted
  text (`<pre className="whitespace-pre-wrap">`). No markdown-rendering library is a
  dependency of this repo; the content is short, already-readable structured markdown, so
  plain preformatted text avoids both a new dependency for one display-only panel and the
  `dangerouslySetInnerHTML` risk of a hand-rolled converter.
- A "Flight Log" panel — the resolved `flightLog: FlightLogEntry[]`, rendered as a plain
  table (time in seconds, lat/lon to 5 decimal places, altitude in meters), keyed by each
  row's `timestampMs` (monotonic and unique per entry, a stable key).

## Phase fit

- **This epic:** the gated content-engine page, the per-slug real-vs-fallback
  resolution mechanism with a visible banner, and `FlightLogEntry` scoped to exactly
  this page's display need.
- **Deferred, tracked but not built here:** per-property real terrain resolution (see
  "What is, and isn't, covered by this resolution" above) once real WebODM/DSM output
  exists for a given slug.
- **Next (per the operator's 2026-08-07 priority order):** the telemetry-driven video
  overlay epic defines its own richer telemetry type against its own real requirements —
  it does not extend `FlightLogEntry` (see the section above).
