# Project CONTEXT

drone-hub ships reusable, plug-and-play React components for drone property
intelligence (map/ortho/thermal layers, 3D models, video annotation/tours),
plus a thin gated app that showcases them — the components are the deliverable.

## Terminology

- **Layer registry** — the typed `{id, type, url, opacity, toggle}` structure that
  drives `<LayerViewer>`; every map/thermal/hillshade/boundary overlay is one entry.
  See `docs/CBA.md`.
- **Nadir grid pass** — a drone flight flown straight down (camera nadir) with
  ~75/70% image overlap, required for photogrammetric alignment. Oblique shots
  do NOT align — this is the Phase-0 blocker.
- **AlignControl** — the manual affine nudge (translate/rotate/scale) used to snap
  an ortho onto the satellite base/parcel boundary, mandatory because the Mini 5
  Pro has no RTK (1-3m drift expected).
- **Tour / room graph** — the `<VideoTour>` data model: a property is `nodes`
  (rooms, each a looping spin clip or still fallback) + `edges` (doorways, each a
  transition clip or cross-fade wipe fallback). See `lib/tour-types.ts`.
- **Spin clip / transition clip** — a spin clip is a looping in-room rotation;
  a transition clip is a directional "flying from room A to room B" clip. Both
  fall back gracefully (still / timed wipe) so a tour is publishable before every
  clip is cut.
- **Folder-per-property manifest** — the convention that one property's assets +
  manifest (e.g. `tour.json`) live together on R2, feeding multiple components
  (VideoTour, Gallery, LayerViewer) from one source of truth.
- **Visual property-intelligence (not survey-grade)** — the framing for all
  geospatial output: useful and visually accurate, but not RTK/GCP-corrected
  survey data. Must be stated wherever ortho/measurement output is presented.

## Key paths

- `middleware.ts` — passcode gate for `/tours/*` (page + any assets under
  `public/tours/**`). No cookie/wrong cookie → 307 redirect to
  `/enter-passcode?next=<original-path>`. See `lib/gate.ts` and the
  Conventions entry below.
- `lib/gate.ts` — shared gate logic (cookie name, passcode comparison,
  `?next=` sanitization) used by both `middleware.ts` (edge runtime) and
  `app/enter-passcode/actions.ts` (node runtime). Passcode lives in env var
  `DRONE_HUB_PASSCODE` (see `.env.example`) — never hardcoded; gate fails
  closed if unset.
- `app/enter-passcode/` — minimal passcode-entry form (`page.tsx`) + the
  server action that validates it and sets the gate cookie (`actions.ts`).
- `CLAUDE.md` — the authoritative kickoff brief: vision, component family,
  operator reality, Phase-0 blocker, finalized stack, build phases, rights rules.
- `docs/CBA.md` — the cost-benefit analysis and finalized build/phase plan
  (buy vs. build per capability).
- `docs/components/<name>.md` — one spec per component (currently: `video-tour.md`,
  `layer-viewer.md`, `model3d.md`).
- `docs/components/reference/` — working prototypes that ARE the spec for a
  component (e.g. `prado-tour.prototype.html` for `<VideoTour>`).
- `app/(showcase)/components/` — the public, ungated component-showcase site. See
  "Showcase-site pattern" below.
- `lib/` — typed schemas shared across components (e.g. `tour-types.ts`).
- `lib/geo-model-types.ts` — `GeoAnchoredModel`, the land-overlay epic's
  geo-space model type (`{id, url, title, lat, lon, altitudeMeters?,
  rotationDegrees?, scale?}`), deliberately unrelated to
  `components/Model3D/Model3D.tsx`'s scene-space `ModelDef`. See
  `docs/components/land-overlay.md`.
- `lib/maplibre-model-layer.ts` — `createModelLayer()`, the MapLibre
  `CustomLayerInterface` engine that renders a `GeoAnchoredModel`'s glTF into
  MapLibre's own WebGL context/render loop (raw three.js, not r3f — a custom
  layer must draw into MapLibre's existing loop, not own its own). Wired into
  `<LayerViewer>` via its `models?: GeoAnchoredModel[]` prop. See
  `docs/components/land-overlay.md` for how it works and how it was
  numerically verified; see the Conventions entry below for the
  custom-layer lifecycle pattern it established.
- `lib/voxel-types.ts` — `VoxelGrid` (`{slug, title, size, heights: number[]}`, a flat
  row-major grid of integer block heights, `heights.length === size*size`), the
  minecraft-content-engine epic's data shape for `<VoxelTerrain>`. Data shape only, no
  color/material — same discipline as `lib/layer-types.ts`'s `LayerDef`. See
  `docs/components/voxel-terrain.md`.
- `lib/flight-log-types.ts` — `FlightLogEntry` (`{timestampMs, lat, lon,
  altitudeMeters}`), the content-engine page's flight-log-panel type. **Deliberately
  minimal — see the Conventions entry below before adding fields to it.**
- `lib/content-engine-resolution.ts` — `resolveContentEngineData()`/
  `readContentEngineFiles()`, the per-slug real-vs-fallback resolution used by
  `/properties/[slug]/engine` (extracted out of that page's Server Component so it's
  unit-testable), plus `SAFE_SLUG_PATTERN` (the path-traversal guard on the
  user-supplied `slug`) and `SAMPLE_SLUG` (`"sample-house"`, the fallback dataset name).
  See `docs/components/content-engine.md` and the Conventions entry below.
- `components/VoxelTerrain/` — `<VoxelTerrain>` + `<VoxelStructure>`, the instanced-mesh
  blocky terrain renderer (reuses `<Model3D>`'s r3f/drei stack, not land-overlay's
  MapLibre-custom-layer approach — this is a standalone 3D scene, no map to composite
  into). See `docs/components/voxel-terrain.md`.
- `components/VoxelTerrain/voxel-geometry.ts` — besides the renderer's own
  centered/fractional world-space math (`gridToWorldX`/`Z`, `buildTerrainBlocks`/
  `buildHouseBlocks`), also exports `terrainCells()`/`houseCells()`: the SAME
  height-band/structure-part classification (`classifyHeightBand`, `TerrainBand`,
  `StructurePart`) as raw, zero-origin, non-negative INTEGER grid cells (`col`,
  `row`, `stackLevel`) with no centering/fractional offset — added by the
  `minecraft-export` epic specifically so the schematic writer below never has to
  floor/rebase a fractional three.js position back onto an integer grid (a real
  block-collision risk a grill review caught). See
  `docs/components/minecraft-export.md`.
- `lib/minecraft-block-palette.ts` — maps `TerrainBand`/`StructurePart` to real,
  core, version-stable Minecraft block-state strings (`minecraft:grass_block`,
  `minecraft:dirt`, `minecraft:stone`, `minecraft:oak_planks`, `minecraft:red_wool`,
  `minecraft:air`), for `lib/minecraft-schematic.ts`. Pure mapping table, no
  NBT/binary concerns of its own. See `docs/components/minecraft-export.md`.
- `lib/minecraft-schematic.ts` — `buildSchematic(grid, structure?): Buffer`, the
  real Sponge Schematic v2 (`.schem`) writer: gzip-compressed, NBT-encoded, loadable
  by an actual Minecraft Java Edition client via WorldEdit/Litematica — not a
  "looks like Minecraft" export. Uses `prismarine-nbt` (a real, intentional
  dependency — see the Conventions entry below) to build/serialize the NBT tree;
  this file does not hand-roll any NBT binary encoding. `DATA_VERSION = 3465`
  (Minecraft Java Edition 1.20.1, confirmed against two independent sources — see
  `docs/components/minecraft-export.md`). See that doc for the writer's three real
  steps (classification reuse, integer coordinate mapping, Palette/VarInt
  `BlockData` encoding) and the golden-fixture-vs-round-trip convention entry below.
- `app/api/minecraft-export/route.ts` — `GET /api/minecraft-export?slug=<slug>`,
  a Next.js Route Handler that builds a `.schem` file server-side (via
  `lib/minecraft-schematic.ts`) and streams it back with `Content-Disposition:
  attachment`. Deliberately **not** behind `middleware.ts`'s gate — it only ever
  serves already-public `public/minecraft-samples/**` data, the same public-safe
  reasoning the `model3d` epic established. Slug validated with the existing
  `SAFE_SLUG_PATTERN` precedent (`lib/content-engine-resolution.ts`), not new
  validation logic. See `docs/components/minecraft-export.md`.
- `components/` — component implementations: `LayerViewer/`, `Model3D/`, `VideoTour/`,
  `VoxelTerrain/`, plus the shared `showcase/` layout. See each component's
  `docs/components/<name>.md`.
- `scripts/` — reserved for pipeline-adjacent tooling. Currently empty.
- `/pipeline` (planned, not yet created) — WebODM/GDAL/PDAL/tippecanoe scripts +
  docker; heavy geospatial processing that never ships in the Vercel bundle.

## Conventions

- Every heavy viewer component is wrapped in `next/dynamic({ ssr: false })`.
- Heavy assets (ortho/point-cloud/video) live on Cloudflare R2, never routed
  through Vercel bandwidth.
- A component's reference prototype (when one exists) is the spec of record —
  match its UX before optimizing implementation details.
- Property footage/data stays gated (passcode) until Mathew explicitly flips a
  given tour/dataset public; owner PII is never stored or shown.
- Gating is real infrastructure, not a convention to assume: `middleware.ts`
  enforces it server-side for `/tours/*` (both the app route and raw
  `public/tours/**` assets) — do not rely on client-side hiding for any new
  gated surface. Add new gated path prefixes to `middleware.ts`'s `matcher`
  as they appear; the passcode compare + cookie logic in `lib/gate.ts` is
  reusable as-is. `<VideoTour>` itself stays gate-agnostic (see
  `gated?: boolean` on `Tour` in `lib/tour-types.ts`) — gating is applied at
  the route/middleware layer, not inside components.
- Methodology: mostly BDD for full component build-out, TDD for complex
  backend/logic units (see `hive.config.yaml → execution.default_methodology`).
- Testing: **Vitest + React Testing Library** is the project's test
  framework (first framework decision for the whole repo, set by the
  `video-tour-test-suite` story — not just for `<VideoTour>`). Config lives
  in `vitest.config.mts` (jsdom environment by default, `@/*` alias matching
  `tsconfig.json`, `@vitejs/plugin-react` for JSX since Vite's own
  esbuild/oxc transform honors `tsconfig.json`'s `jsx: "preserve"`, needed by
  Next.js, and won't parse JSX on its own) + `vitest.setup.ts` (registers
  `@testing-library/jest-dom` matchers, auto-cleans up the DOM between
  tests). Run via `npm test` (`vitest run`) or `npm run test:watch`
  (`vitest`) — `npm test` is the pre-push check until CI exists. New spec
  files no longer need a per-file `// @vitest-environment jsdom` pragma;
  the shared config covers it.
- `public/tours/<slug>/` (e.g. `public/tours/2806-prado/`) — a **P1-only local-asset
  convention**: extracted stills + `tour.json` served straight from Next.js
  `public/`. This is a convenience for the stills/wipes MVP, not the target
  architecture — it stands in for the R2 folder-per-property convention
  (see "Folder-per-property manifest" above and CLAUDE.md's data pipeline)
  until real video clips arrive, at which point assets migrate to R2 (no later
  than P2).
- **MapLibre custom-layer lifecycle pattern** (standing convention,
  established by `lib/maplibre-model-layer.ts`'s `createModelLayer()` in the
  `land-overlay` epic — see `docs/components/land-overlay.md`'s "five
  corrections" section for the full rationale): any MapLibre
  `CustomLayerInterface` implementation in this codebase (the next one
  expected: the Minecraft voxelizer/content-engine epic, queued after
  land-overlay, per CLAUDE.md's 2026-08-07 priority order) should follow the
  same four rules, not reinvent them from MapLibre's own bare-happy-path
  example:
  - **Ready-guard:** a `ready` flag, false until whatever the layer draws has
    actually finished loading; `render()` checks it FIRST, before touching
    anything else — `onAdd` is synchronous but real asset loading (glTF
    fetch/parse, etc.) is async, and MapLibre WILL call `render()` before
    that finishes on a real map.
  - **Cancelled-guard:** a `cancelled` flag flipped the instant `onRemove()`
    fires, checked both before any in-flight lazy-module-load resolves and
    before any in-flight asset-load callback would otherwise mutate the
    scene — prevents a load that resolves after unmount from adding to (and
    leaking) a scene nobody will ever render or dispose again. Mirrors
    `LayerViewer.tsx`'s own manifest-resolution effect's `cancelled` flag.
  - **`renderer.resetState()` after every `render()` call, before returning
    control to MapLibre:** three.js's `WebGLRenderer` (or any raw-GL
    renderer sharing MapLibre's context) mutates GL state
    (depth/blend/cull/viewport) as a side effect of drawing — skip this and
    MapLibre's own subsequent layer draws can render corrupted immediately
    after your custom layer's frame. Has its own dedicated regression test
    in `lib/maplibre-model-layer.placement.test.ts` (toggle an unrelated
    MapLibre layer off/on after the custom layer has drawn a frame, confirm
    pixel-identical output vs. a page that never added the custom layer).
  - **Full disposal on `onRemove()`:** explicitly `.dispose()` every
    GPU-resource-holding object (geometry/material/texture) the layer
    created — raw three.js/WebGL objects don't get garbage-collected just
    because a JS reference is dropped.
- **Showcase-site pattern** (standing convention, established by the `model3d` epic —
  see `.pHive/epics/model3d/docs/design-discussion.md`): every plug-and-play component
  gets a public, ungated demo page under `app/(showcase)/components/<name>/page.tsx`,
  listed on the index at `app/(showcase)/components/page.tsx`. This is a shadcn-style
  component-framework docs site, not a gated app surface:
  - The route group `app/(showcase)/components/` is deliberately **outside**
    `lib/gate.ts`'s `GATED_PATH_PREFIXES` and `middleware.ts`'s `config.matcher` — no
    passcode required. It shares no layout with the gated `/tours`, `/properties` route
    trees.
  - Every page wraps its live demo in the shared `<ComponentShowcase>` layout
    (`components/showcase/ComponentShowcase.tsx`) — title, description, demo slot, usage
    code-snippet slot. `<ComponentShowcase>` is purely presentational and has no opinion
    about gating; the *route* decides public vs. gated (which layout wraps the page), not
    the component. This is deliberate, so the same layout can be reused later inside a
    gated surface (e.g. a future content-engine page) without a rebuild.
  - Heavy viewers are still mounted via `next/dynamic({ ssr: false })` inside the
    showcase page, same convention as the gated routes.
  - Precedent pages: `/components/video-tour`, `/components/layer-viewer`,
    `/components/model3d` — two retrofitted onto already-shipped components, one (`model3d`)
    proven fresh on day one, confirming the pattern isn't a one-off.
  - **The single most important rule this pattern established: a showcase page's demo
    data must independently qualify as public-safe — it is NEVER assumed-safe by
    association with another component's sample data, even data about the "same"
    property.** Each component's sample/demo dataset gets its own rights check before it
    can be referenced from an ungated page. This was learned the hard way during planning:
    an early draft of the `model3d` epic's design discussion assumed `<VideoTour>`'s
    showcase could reuse `public/tours/2806-prado/tour.json` on the strength of
    `<LayerViewer>`'s showcase safely reusing `public/layer-viewer-samples/2806-prado/
    layers.json` — but those two datasets, despite sharing the "2806-prado" name, are not
    equivalent: the LayerViewer one is synthetic/public-source sample data built for
    exactly this purpose, while the VideoTour one is **real, currently-gated photography
    of Mathew's actual listed address** (`GATED_PATH_PREFIXES` covers `/tours/*` for
    precisely this reason). Grill caught the mistake before it shipped. The fix: VideoTour's
    showcase page sources its own separate, genuinely public-safe demo tour
    (`public/showcase-samples/demo-house/tour.json` — generic placeholder room images, no
    real address, no real people), and a regression-guard test
    (`app/(showcase)/components/video-tour/page.test.tsx`) asserts the page's source code
    never contains `2806-prado` or references the `/tours/` route family. Apply the same
    discipline to every future component: before wiring a showcase demo to any existing
    sample/manifest file, verify — don't assume — that file was built (or is otherwise
    confirmed) to be safe for an ungated, public page, independent of any other
    component's sample data that happens to share a name, slug, or property.
- **Real-per-slug-data-with-an-explicit-fallback-banner pattern** (standing convention,
  established by `lib/content-engine-resolution.ts` in the `minecraft-content-engine`
  epic — see `docs/components/content-engine.md` for the full explanation, this is the
  short reusable version): for any gated page that shows per-entity content which may or
  may not exist yet for a given slug (property, tour, etc.), do not hardcode a single
  sample dataset shown regardless of slug, and do not silently 404. Instead: (1) look for
  real data at a per-slug path first; (2) if absent, fall back to one shared, clearly-
  labeled sample dataset; (3) compute an explicit `isFallback` boolean from step 1's
  actual result (never a guess, never inferred from the slug string) and use it to render
  a genuinely visible (not a footnote) banner telling the viewer they're looking at sample
  data, not this entity's real records. This exists because a gated page silently showing
  generic demo content indistinguishable from real data misleadingly implies exclusivity
  — the exact gap a grill review caught in this epic's original design. Precedent
  functions: `resolveContentEngineData()`/`readContentEngineFiles()` in
  `lib/content-engine-resolution.ts`; precedent banner: `EnginePageClient.tsx`'s
  `role="alert"` fallback banner. Any future gated page needing "real data if it exists,
  clearly-labeled sample data if it doesn't" should follow this shape rather than
  reinventing it.
- **`FlightLogEntry` minimal-scope precedent** (`lib/flight-log-types.ts`, established by
  the `minecraft-content-engine` epic): this type is scoped to exactly what the
  content-engine page's flight-log panel displays — `{timestampMs, lat, lon,
  altitudeMeters}`. An earlier draft of this epic designed it with gimbal
  pitch/yaw/roll fields anticipated for the *future* telemetry-driven-video-overlay
  epic's camera-pose computation; grill flagged that as speculative design inconsistent
  with this project's own established practice (`GeoAnchoredModel` was deliberately kept
  separate from `<Model3D>`'s `ModelDef` rather than pre-unified for land-overlay's
  then-future needs — the same precedent this correction follows). **Before extending
  `FlightLogEntry` in a future session** (e.g. once the telemetry-video-overlay epic is
  actually being planned), re-read `docs/components/content-engine.md`'s `FlightLogEntry`
  section and `lib/flight-log-types.ts`'s own header comment first — the intended fix, if
  that epic needs gimbal/orientation/camera-pose data, is for it to define its **own**
  richer type against its own real requirements, not to grow this one.

- **Golden-fixture-vs-round-trip convention** (standing convention, established by
  the `minecraft-export` epic's `minecraft-export-test-suite` story — see
  `docs/components/minecraft-export.md`'s "Verification" section for the full
  worked example): **same-library round-trip tests are not sufficient
  spec-conformance verification for binary/interop file formats.** Writing with a
  library and reading back with the same library only proves the library is a
  fixed point of its own serialization — it passes identically whether the target
  spec was understood correctly or consistently-but-wrongly (e.g. the wrong
  byte-iteration order), because both the write and read side apply the same
  (possibly wrong) logic and agree with each other. This isn't specific to
  Minecraft's Sponge Schematic format — it applies to any future format-export
  work in this codebase (a real Anvil world export, a future point-cloud/LAZ
  writer, a COG/GeoTIFF writer, etc.): **hand-verified golden fixtures — expected
  values derived independently of the code under test, by tracing the documented
  spec by hand before ever running the writer, then compared against the writer's
  real output — are required** alongside (not replaced by) an ordinary
  same-library round-trip sanity check. Precedent implementation:
  `lib/minecraft-schematic.golden-fixture.test.ts`'s two hand-derived fixtures,
  kept in a file separate from the round-trip specs specifically so the
  distinction stays visible rather than getting blended together.
- **`prismarine-nbt` is a real, intentional dependency**, not an accidental
  transitive addition — added by the `minecraft-export` epic to build/serialize
  NBT compound tag trees for `lib/minecraft-schematic.ts` (part of the maintained
  PrismarineJS ecosystem, used across many Minecraft bot/tooling projects). This
  codebase does not hand-roll NBT binary encoding; if a future epic needs NBT
  again, reuse this dependency rather than adding a second one.

- **Rendering a static prose doc (`docs/**/*.md`) as a real page: hardcode the
  slug list in `generateStaticParams`, never `fs.readdirSync` the source
  directory.** Precedent: `app/(showcase)/docs/components/[slug]/page.tsx`
  (framework-docs-site epic) enumerates its 7 known slugs as a literal array
  rather than scanning `docs/components/` — that directory also holds a
  `reference/` subdirectory (`docs/components/reference/prado-tour.prototype.html`),
  and an unfiltered directory scan feeding straight into `readFileSync` throws
  `EISDIR` at build time the moment it hits a non-file entry. A hardcoded slug
  array both sidesteps this and matches `generateStaticParams`' own job
  (enumerate exactly the pages that should exist, not "whatever's currently on
  disk"). Markdown rendering itself uses `react-markdown` + `remark-gfm` (GFM
  task-list checkboxes — several docs use `- [x]`/`- [ ]` — not tables; no doc
  in this repo uses GFM pipe tables) — no `rehype-raw` (none of the docs
  contain raw HTML blocks) and no syntax-highlighter (plain `<pre><code>` is
  react-markdown's default and these docs aren't a code-reading product
  surface). **Gotcha, already hit once:** react-markdown passes an extra
  `node` prop to custom component renderers — spreading `{...props}` directly
  onto a native DOM element leaks a literal `node="[object Object]"` attribute
  onto every styled element. Destructure `node` out before spreading.
- **Retiring a duplicate route via `next.config.ts` `redirects()`: delete the
  old page file and its test in the same story, don't leave them in place.**
  Precedent: the framework-docs-site epic consolidated `/components` into `/`
  by adding a permanent redirect and, in the same commit, deleting
  `app/(showcase)/components/page.tsx` and its co-located
  `page.test.tsx`. Reason (caught by this epic's grill pass before any code
  was written): `next.config.ts` redirects fire before Next's filesystem
  router ever reaches the old page, so leaving the file in place creates a
  permanently-dead route — and an RTL test that renders the old page
  component directly (`render(<OldPage />)`, bypassing routing entirely)
  keeps passing forever regardless, becoming a false-green test that asserts
  on an unreachable route. If the retired page's test coverage is worth
  keeping, re-home equivalent assertions against the page that now serves
  that content, in the same story that does the deletion.

- **This app mounts at `tools.mdostal.com/framework` via a Next.js multi-zone
  rewrite** (in the separate `mdostal-tools-hub` repo, `~/Code/mdostal-tools-hub`
  locally). `next.config.ts` sets `basePath: "/framework"` (disabled via
  `E2E_NO_BASE_PATH=1` for local/E2E use, matching mapstack-us/allergy-locator's
  identical established pattern for their own tools.mdostal.com mounts) —
  `NEXT_PUBLIC_BASE_PATH` is inlined at build time for the client call sites
  Next's automatic basePath prefixing doesn't cover (`<Link>`/`<Image>`/router
  navigation are covered automatically; a raw `fetch`/`<a href>`/`<img src>`
  string, or a `manifest="/..."` prop, is NOT). `lib/base-path.ts`'s
  `withBasePath()` wraps those call sites — but **only at drone-hub's own app/
  page level**, never inside the portable library components themselves
  (`components/LayerViewer`, `components/VideoTour`), which must stay
  basePath-agnostic to remain genuinely plug-and-play into other apps.
  **Two distinct basePath gotchas found and fixed here, both worth knowing
  before touching gating or manifest-driven components again:**
  1. **Root-absolute manifest asset URLs break under ANY basePath.**
     `layers.json`/`tour.json` used to embed root-absolute paths (e.g.
     `"/layer-viewer-samples/2806-prado/ortho.tif"`) — a browser `fetch()`/
     `<img src>` of a leading-slash string always resolves against the
     *origin*, discarding any basePath (WHATWG URL spec), so this broke the
     moment the app moved off bare-root. Fixed by making manifest asset
     fields bare filenames (relative to the manifest's own directory) and
     having `LayerViewer.tsx`'s `resolveManifest()` / `VideoTour.tsx`'s
     `resolveTourAssetUrls()` re-resolve each one via
     `new URL(assetUrl, res.url)` (the Fetch API's own resolved URL) — this
     works under ANY basePath/origin with zero basePath-specific code in the
     components themselves, which is the more portable fix, not just a
     patch for this one deployment.
  2. **`NextResponse.redirect(new URL("/x", request.url))` in middleware
     silently drops the basePath.** A leading-slash second argument to
     `new URL()` discards the base's own path per the WHATWG spec regardless
     of what `request.url` contains — `middleware.ts`'s passcode-gate
     redirect used exactly this pattern and, under basePath, redirected to
     `/enter-passcode` instead of `/framework/enter-passcode` (confirmed
     empirically via a real basePath build + curl before/after). Fixed with
     `request.nextUrl.clone()` (a `NextURL` instance, basePath-aware on
     serialization) instead of a raw `new URL()`. **Any future middleware
     redirect must use `request.nextUrl.clone()`, never
     `new URL(path, request.url)`.**

## Known issues

- **`sanitizeNextPath`/`GATED_PATH_PREFIXES` use unanchored string-prefix matching, not
  path-boundary-aware matching.** `lib/gate.ts`'s `GATED_PATH_PREFIXES` array (currently
  `["/tours", "/properties"]`) is checked via plain `next.startsWith(prefix)` in
  `sanitizeNextPath`, and `middleware.ts`'s matcher is derived from the same prefixes via
  `${prefix}/:path*`. Neither is path-segment-boundary-aware — e.g. a hypothetical future
  route like `/propertiesfoo` would `startsWith("/properties")` even though it isn't
  actually nested under `/properties/*`. This pre-dates the `minecraft-content-engine`
  epic (the prefix-list mechanism itself was built in the `layer-viewer-gating-extension`
  story) and was verified against the real code, not assumed, during this epic's grill
  review while confirming `/properties/[slug]/engine` needed no new gating changes — it
  is flagged here as a known, pre-existing hardening opportunity, not a bug introduced by
  this epic, and not yet fixed by any story. A future fix should assert on a real
  path-boundary check (e.g. exact match or followed by `/`) rather than raw
  `startsWith`.

- ~~`@geomatico/maplibre-cog-protocol` misreports WGS84 bounds for non-EPSG:3857
  COGs.~~ **Fixed 2026-08-08** by reprojecting the sample `ortho.tif`/
  `hillshade.tif` from EPSG:32621 to EPSG:3857 (`rio warp` + `rio cogeo
  create`/`validate`) rather than patching the library — the library hardcodes
  a Web Mercator assumption (`SphericalMercator`/`"900913"`) for every COG it
  loads and never reads the file's actual CRS, so any non-3857 COG will hit
  this identically; reproject ahead of time. Full root-cause writeup:
  `docs/components/land-overlay.md`'s "Fixed" section (renamed from "Known
  open issue"). `heightmap.json` (minecraft-content-engine) was regenerated
  in lockstep since it derives from the same `hillshade.tif`, which changed
  dimensions (512×512 → 549×522) under the reprojection's bilinear
  resampling.

## Canonical references

- `CLAUDE.md` — full kickoff brief (source of truth for scope/rules).
- `docs/CBA.md` — build phases, buy/build decisions, risks.
- `docs/components/video-tour.md` + `docs/components/reference/prado-tour.prototype.html`
  — the `<VideoTour>` spec and its reference implementation.
- `docs/components/layer-viewer.md` — the `<LayerViewer>` spec.
- `docs/components/model3d.md` — the `<Model3D>` spec and the showcase-site pattern's
  origin story.
- `docs/components/land-overlay.md` — the `<LayerViewer>` `models` prop
  (`GeoAnchoredModel` + `createModelLayer`) spec: how the custom-layer engine
  works, the numeric verification approach, and the open cog-protocol bounds
  bug.
- `docs/components/voxel-terrain.md` — the `<VoxelTerrain>`/`<VoxelStructure>` spec:
  `VoxelGrid`, the offline heightmap data-prep approach, and the live-verified
  instancing performance requirement.
- `docs/components/content-engine.md` — the gated `/properties/[slug]/engine` page
  spec: the per-slug real-vs-fallback resolution mechanism, the fallback banner,
  `FlightLogEntry`'s minimal scope, and the `SAFE_SLUG_PATTERN` path-traversal guard.
- `docs/components/minecraft-export.md` — the real Sponge Schematic (`.schem`)
  download feature: format choice, the writer's three steps, the `DataVersion`
  sourcing, the API route, the UI entry points, and the golden-fixture
  verification approach (including what could and couldn't be verified without a
  real Minecraft client in this environment).
- `.pHive/project-profile.yaml` — full discovered project profile + north star.
