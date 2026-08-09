# `<Model3D>` — glTF mesh viewer (hive spec)

> Orbit a **3D mesh** (glTF/glb) rendered straight from photogrammetry output — CBA's
> Phase-3 `Model3DViewer`. Plug-and-play, importable into any app, publicly showcased.

**Update (operator, 2026-08-08):** drone-hub carries no gating of any kind — every
reference below to `middleware.ts`, `lib/gate.ts`, `GATED_PATH_PREFIXES`, or a passcode
gate describes an architecture that no longer exists in this repo (kept as historical
record). This component's showcase page was always public/ungated, so nothing about its
behavior changed — the correction is that NOTHING else in this repo is gated either now.

**Design discussion (RESOLVED architecture — read first):**
`.pHive/epics/model3d/docs/design-discussion.md` — this doc documents those decisions,
it does not re-derive them.

## Why (operator intent — honor this)

CBA's target pipeline (nadir passes → WebODM/OpenDroneMap → orthomosaic + DSM + point
cloud + glTF mesh) produces a mesh alongside the ortho `<LayerViewer>` drapes on the map.
`<Model3D>` is the component that renders that mesh on its own — "view an interactive 3D
model (point cloud + mesh), orbit it" from `CLAUDE.md`'s Hammer Missions reference list.
This epic ships the **glTF/mesh half** of that (CBA's Phase 3); point-cloud rendering
(potree) is a later phase, not built here.

This epic also shipped a second, cross-cutting thing alongside `<Model3D>` itself: the
**component-framework showcase site** (`app/(showcase)/components/`) — a public,
shadcn-style page-per-component pattern, proven against `<Model3D>` (built fresh) and
retrofitted onto `<VideoTour>`/`<LayerViewer>` (already shipped) in the same epic. See
`.pHive/CONTEXT.md`'s "Showcase-site pattern" entry for that as a standing convention —
this doc covers `<Model3D>` the component; the showcase pattern itself is documented
there since it applies to every component, not just this one.

## The model — `ModelDef`, deliberately minimal

```ts
export interface ModelDef {
  id: string;
  url: string;
  title: string;
  /** How many raw glTF units equal one real-world meter, for the measure
   *  tool's distance label. Optional, absent by default (including for the
   *  sample duck) — see "Measure tool + controls legend" below. */
  unitsPerMeter?: number;
}

export interface Model3DProps {
  model: ModelDef;
  /** Fired if the glTF fails to load (bad url, network error, parse error). */
  onLoadError?: (message: string) => void;
  className?: string;
}
```

That's the whole registry entry — `{id, url, title}`, plus one narrow, additive
exception added by the `brand-theming-and-viewer-polish` epic's measure tool
(`unitsPerMeter?`, covered below). This matches what's actually shipped in
`components/Model3D/Model3D.tsx`; there is no separate manifest file for P1 (a single
sample model, hardcoded inline on the showcase page — see "Sample data" below), unlike
`<LayerViewer>`'s `PropertyLayers`/`<VideoTour>`'s `Tour`, which both do have a
manifest-file convention. A single-model P1 scope didn't warrant one; if a future epic
needs to list multiple models per property, that's the point to add one.

`unitsPerMeter` is still not a scale/position/geo-anchoring *transform* field — it
doesn't move, resize, or reorient the mesh in any scene. It only feeds the measure
tool's distance-label formatting (see below). The "no scale/position/geo-anchoring on
`ModelDef`" rule from the original epic (next section) is about placement, and stays
intact.

### Deliberately deferred: scale, position, geo-anchoring

`ModelDef` intentionally does **not** carry `scale`, `position`, or any geo-anchoring
field (lat/lon/alt). This was flagged by grill during planning and resolved explicitly
in `design-discussion.md` §2.3 / §6.2, and repeated as a hard `do_not` in
`model3d-component.yaml`:

> Do not add scale/position/geo-anchoring fields to ModelDef in this epic — explicitly
> deferred to the land-overlay epic's own type, per the design discussion.

Why: a `position` field could mean two genuinely different things — **scene-space**
placement (where this mesh sits within its own free-floating `<Canvas>`, e.g. offsetting
multiple meshes in one scene) or **geo-space** anchoring (lat/lon/alt draping the mesh
onto `<LayerViewer>`'s map, CBA's 2.5D-drape direction). Which one a future epic actually
needs isn't decided yet — the **land-overlay** epic (next in the confirmed priority order
after this one, per `design-discussion.md` §0) is where that gets resolved, with its own
new type built for whichever semantics it turns out to need. Guessing now risks shipping
the wrong shape and having to break `ModelDef`'s consumers to fix it. P1's viewer only
ever renders one free-floating mesh in its own scene, auto-framed by `<Bounds>` — there's
no placement decision to make yet that guessing on `ModelDef` would actually serve.

## Behavior

1. **Mounts a `@react-three/fiber` `<Canvas>`** with a fixed default camera
   (`position: [3, 3, 3]`, `fov: 50`) and a small three-light rig (ambient + two
   directional) — enough to read an arbitrary untextured or lightly-textured mesh
   without per-model lighting configuration.
2. **Loads the glTF/glb at `model.url`** via drei's `useGLTF` inside a `<Suspense>`
   boundary (`GltfScene` renders `gltf.scene` as a single `<primitive>`, so it works for
   both a single-mesh glTF and a multi-node hierarchy without assuming a shape). While
   the fetch/decode is in flight, `<Suspense>`'s fallback renders a small wireframe box
   placeholder (`LoadingPlaceholder`) inside the canvas — DOM can't render inside a
   `<Canvas>`'s r3f tree, so this has to be r3f JSX, not a spinner overlay.
3. **Auto-frames the mesh** with drei's `<Bounds fit clip observe margin={1.2}>` wrapping
   `<GltfScene>` — fits the camera to the mesh's bounding box on mount (`fit`), pushes the
   camera's near/far planes so the mesh isn't clipped (`clip`), re-fits if the mesh's own
   bounds change later, e.g. a swapped `model.url` (`observe`), and leaves a little
   breathing room around the mesh rather than a tight crop (`margin={1.2}`). This is what
   makes an arbitrary glTF of unknown scale/units/origin render "reasonably framed"
   without `ModelDef` needing a `scale`/`position` field to compensate.
4. **Orbit/zoom/pan** via drei's `<OrbitControls makeDefault />`. `makeDefault` registers
   these controls as the r3f store's active controls instance, which is what `<Bounds>`'s
   internal camera-fit animation targets through `useThree().controls` — without it,
   `<Bounds>`'s auto-fit and `<OrbitControls>` fight over the camera instead of
   cooperating on mount.
5. **Load/parse failures are caught, not fatal to the page.** `useGLTF`'s Suspense-throw
   only covers the pending-promise case, not a rejected one (bad url, 404, malformed
   file) — `ModelErrorBoundary`, a class component (error boundaries have no hook
   equivalent), catches that and calls `onLoadError`, rendering nothing rather than
   unmounting the whole viewer with an uncaught error.

## Measure tool + controls legend

**Shipped by the `brand-theming-and-viewer-polish` epic's `model3d-measure-tool-and-
legend` story.** This corrects `README.md`/`app/page.tsx`'s pre-existing "orbit-and-
measure" copy, which had been describing an unbuilt feature since `<Model3D>` first
shipped — see `design-discussion.md §2`'s research note for that history. It also
corrects this doc's own prior claim that measure was "explicitly deferred" — that was
true for the original `model3d` epic (P1, glTF viewer only) but is no longer true of
the component as it exists today.

1. **A "Measure" toggle button** lives in the on-canvas controls legend (see below).
   Clicking it flips `measureMode` on/off; the button's own label and styling reflect
   the state (`"Measure"` vs. `"Measure: On"`, accent-filled when active).
2. **Click-to-place two points, via raycasting against the loaded mesh.**
   `MeasureController` (a `<Canvas>`-level component with no visual output of its own)
   listens for native `pointerdown`/`pointerup` on the canvas's own DOM element — not
   r3f's per-object synthetic pointer events — and only registers a placement when the
   gesture qualifies as a genuine click: less than `CLICK_MAX_MOVEMENT_PX` (6px) of
   on-screen movement between down and up, completed within `CLICK_MAX_DURATION_MS`
   (500ms). A drag (or a long press) is ignored, so measure mode can be left on without
   ever fighting `<OrbitControls>` for the same drag gesture — `MeasureController` never
   calls `stopPropagation`/`preventDefault`, so `OrbitControls`' own native listeners on
   that same canvas element see every drag event untouched. A qualifying click converts
   the pointer position to normalized device coordinates, raycasts against the loaded
   scene graph (reported up via `GltfScene`'s `onSceneReady`), and reports the first
   hit's world-space point up to `<Model3D>`'s own state.
3. **The distance line + midpoint label.** Once two points are placed, `MeasureOverlay`
   renders a small accent-colored sphere at each point, an accent-colored `Line`
   connecting them (drei's `<Line>`), and a floating label at the segment's midpoint
   (drei's `<Html>`, a DOM portal) showing the distance. **The label is deliberately
   "X.XX units", not a fabricated real-world unit** — `formatDistance()`
   (`components/Model3D/Model3D.tsx`) only prints `"X.XX m"` if the caller's `ModelDef`
   supplies `unitsPerMeter` (a raw-glTF-units-per-real-meter scale hint); absent, as it
   is for the sample duck (there is no known real-world scale for it, and none in
   general for `<Model3D>` until a real photogrammetry pipeline supplies one), it stays
   labeled `"units"`. This matches this repo's established honesty-about-precision
   convention — the same reasoning `CLAUDE.md`'s "visual property-intelligence, not
   survey-grade" framing applies to `<LayerViewer>`'s ortho output, and the same reasoning
   behind every synthetic sample layer's `legend: "synthetic placeholder — not real ..."`
   wording: never imply a precision or ground-truth the data doesn't actually have.
4. **A grill-flagged placement constraint: measure geometry renders OUTSIDE `<Bounds>`,
   as a `<Canvas>`-level sibling, never as its child.** `<Bounds fit clip observe
   margin={1.2}>` recomputes the camera's fit from the bounding box of everything it
   wraps; placing `MeasureOverlay`'s markers/line *inside* it would grow that box with
   every new point and trigger an unwanted camera re-frame/zoom mid-measurement — exactly
   the "camera doesn't unexpectedly re-frame" requirement `design-discussion.md §3c`
   calls out explicitly. `<Bounds>`'s own wrapping `<group>` applies no transform of its
   own (verified by reading `@react-three/drei`'s `Bounds.js` directly, not assumed), so
   world-space points raycast against the mesh *inside* `<Bounds>` still line up correctly
   with markers rendered *outside* it — no coordinate conversion needed. Live-verified via
   Playwright: placing two points produced a distance label with the duck staying
   pixel-identical in position/scale (camera did not move).
5. **Clearing a measurement — two ways, both real.** Placing a third point (once two are
   already placed) discards the old pair and starts a fresh measurement at the new
   point (`handlePlacePoint`'s `prev.length >= 2 ? [point] : [...prev, point]` reset).
   Independently, the legend's **"Clear measurement" button** (visible only while measure
   mode is on, disabled/greyed when there are no points to clear) resets the same state
   on demand without requiring a third click. Both call the same `setPoints` reset under
   the hood — there is no separate "undo one point" affordance, only "start over."
6. **The on-canvas controls legend.** A small fixed-corner panel (top-right, absolutely
   positioned within `<Model3D>`'s own container, not a separate page element — "a little
   legend on the side," per the operator's own request) always lists the always-available
   controls (`Drag to orbit`, `Scroll to zoom`) plus the Measure toggle button, and — only
   while measure mode is active — `Click two points to measure` and the Clear button
   described above. Styled via this epic's design tokens (`bg-surface/90`, `border-border`,
   `text-foreground`, `text-accent` from `app/globals.css`'s `@theme` block — see
   `.pHive/CONTEXT.md`'s design-token entry), with a `backdrop-blur` so it stays legible
   over an arbitrary mesh/background. The legend's outer wrapper is `pointer-events-none`
   (only the panel itself is `pointer-events-auto`), so it never intercepts orbit/measure
   clicks over the rest of the canvas.

The marker-sphere radius (`markerRadius` state) is computed from the loaded mesh's own
bounding-box diagonal (`handleSceneReady`, 1% of the diagonal, falling back to a fixed
`0.02` for an empty/degenerate box) rather than hardcoded, so a marker reads sensibly
whether the glTF is duck-scale (tens of units) or a future real photogrammetry mesh at a
totally different scale.

## Tech

- **`@react-three/fiber`** (`^9.7.0`) — the WebGL/Canvas React renderer.
- **`@react-three/drei`** (`^10.7.8`) — `useGLTF`, `<Bounds>`, `<OrbitControls>` (both
  locked dependencies, unused until this epic — its first real exercise).
- **`three`** (`^0.169.0`) — unchanged; satisfies both packages' peer range.
- **`next/dynamic({ ssr: false })`** — `<Model3D>` is a heavy client-only viewer (WebGL
  canvas, texture/geometry decoding) like every other viewer in this stack; no
  server-only APIs are touched at module scope, but it must still not attempt to render
  on the server. Every real usage in this repo (the showcase page; the now-deleted
  dev-preview route) mounts it this way.
- **Not used by this epic despite being CBA's eventual target:** potree / point-cloud
  rendering (COPC/LAZ) — CBA phases that in after the glTF-mesh path is proven; nothing
  in `components/Model3D/` assumes or blocks it.

### r3f/drei dependency correction — why the version bump

`model3d-component.yaml` scaffolded this epic against `@react-three/fiber ^8.17.0` +
`@react-three/drei ^9.114.0` (the versions locked in `package.json` when the epic was
planned). Both were bumped during `model3d-component` to `@react-three/fiber ^9.7.0` +
`@react-three/drei ^10.7.8`. Reason, verified empirically (not assumed): `@react-three/
fiber` v8 bundles its own react-reconciler host config written against pre-React-19
internals — it crashes the instant `<Canvas>` mounts under React 19
(`Cannot read properties of undefined (reading 'ReactCurrentOwner')`), and this can't be
patched by pointing it at a newer `react-reconciler` either, because reconciler 0.31+
needs a `resolveUpdatePriority` host-config hook that v8's compiled renderer never
implements. No combination of `react-reconciler` version satisfies both React 19's
internals and v8's host config at once. `@react-three/fiber` v9 is pmndrs' from-scratch
React-19 rewrite (its own bundled reconciler, no external `react-reconciler` dependency)
and is what actually renders and accepts `<OrbitControls>` input under `react ^19.0.0` —
confirmed via live Playwright verification, not just "it type-checks." `drei` v10 is the
matching major for `@react-three/fiber` v9 (drei versions its majors alongside fiber's).
`three ^0.169.0` didn't need to move — it already satisfied both packages' peer ranges.
This correction is recorded in `package.json`'s own `_model3d_component_note` field as
well as here.

`.npmrc`'s `legacy-peer-deps=true` (already present from the `video-tour-app-shell-
scaffold` story's `@react-three/fiber`-vs-React-19 workaround) covers `drei`'s peer
constraints too — re-verified during this epic, not just assumed to carry over.

## Sample data — `public/model3d-samples/duck/model.glb`

A small (~120KB) public-domain glTF from Khronos's own `glTF-Sample-Models` repo
(`Duck.glb`, CC0-equivalent license per that repo) — chosen because it's small, a real
binary glTF (not a synthetic placeholder), and exercises the exact loader path
(`useGLTF` → `<primitive object={gltf.scene}>`) a real WebODM-exported mesh will use
later. No rights issue: not property photogrammetry, not tied to any address or person.
There is no manifest file alongside it — the showcase page hardcodes the `ModelDef`
inline (`{ id: "duck", url: "/model3d-samples/duck/model.glb", title: "Duck (sample
glTF)" }`), per the "no manifest file for a single-model P1 scope" decision above.

## The showcase page — public, not gated

`<Model3D>` is demoed at `/components/model3d`
(`app/(showcase)/components/model3d/page.tsx`), part of the `app/(showcase)/components/`
route group — deliberately **outside** `lib/gate.ts`'s `GATED_PATH_PREFIXES`
(`["/tours", "/properties"]`) and `middleware.ts`'s `config.matcher`
(`["/tours/:path*", "/properties/:path*"]`). No passcode redirect; the page loads and
renders the sample duck directly. This is safe specifically because the sample glTF is
public-domain and carries no property/rights sensitivity — see `.pHive/CONTEXT.md`'s
public-safe-demo-data rule for why this isn't a blanket license for every showcase page
to skip gating without its own rights check.

```tsx
import { Model3D } from "@/components/Model3D";

<Model3D
  model={{ id: "duck", url: "/model3d-samples/duck/model.glb", title: "Duck (sample glTF)" }}
/>
```

## Acceptance criteria

The first block below is scoped to the original `model3d` epic (P1: `<Model3D>` on a
single sample glTF, plus the showcase-site pattern) — point-cloud rendering and
scale/position/geo-anchoring *placement* were, and remain, explicitly out of scope, see
Phase fit. **Measure is no longer out of scope** — the original P1 scoping here read
"Measure... explicitly deferred"; that was accurate when this doc was first written but
is now stale. The real, shipped measure tool + controls legend (from the
`brand-theming-and-viewer-polish` epic) is documented above under "Measure tool +
controls legend," with its own acceptance criteria in the second block below.

- [x] Given a glTF/glb url, when `<Model3D>` mounts, then the mesh renders visibly in the
      canvas, reasonably framed (not off-screen/invisibly tiny/huge).
  Verified: `Model3D.tsx` wraps `<GltfScene>` in drei's `<Bounds fit clip observe
  margin={1.2}>`, which auto-fits the camera to the loaded mesh's bounding box on mount
  and re-fits on bounds changes — not a fixed camera guessing at an arbitrary model's
  scale. `model3d-component`'s Playwright pass confirmed the duck sample renders visibly
  and centered against the real running app (WebGL needs a real browser context; this
  can't be verified under jsdom — see `Model3D.test.tsx`'s header comment).
- [x] Given mouse drag/scroll on the canvas, when performed, then `<OrbitControls>`
      actually rotates/zooms the view (verified live, not just that the prop is wired).
  Verified: `<OrbitControls makeDefault />` is mounted inside the same `<Canvas>`;
  `makeDefault` registers it as the r3f store's active controls instance, which is what
  `<Bounds>`'s internal camera-fit animation targets via `useThree().controls` — without
  it the two would fight over the camera instead of cooperating. `model3d-component`'s
  Playwright pass exercised drag-to-orbit and scroll-to-zoom against the real duck model
  and confirmed the camera actually moved (live browser verification, not a prop-wiring
  assertion under jsdom).
- [x] Given `next/dynamic({ ssr: false })`, when `<Model3D>` is imported anywhere, then
      it's compatible with that wrapping (no server-only APIs; confirmed via a real usage
      in a later story).
  Verified: `Model3D.tsx`'s header comment documents that no server-only APIs are touched
  at module scope (`@react-three/fiber`'s `<Canvas>` and drei's hooks only touch
  `window`/WebGL once mounted). Two real usages confirm this in practice:
  `app/(showcase)/components/model3d/page.tsx` (the shipped showcase page) and the
  now-deleted `app/dev-preview-model3d/page.tsx` (superseded by the showcase page, removed
  by this closeout story) both mount `<Model3D>` via
  `dynamic(() => import("@/components/Model3D")..., { ssr: false })`, and both build/run
  clean.
- [x] Given `npm run build`, when run, then it passes with no regressions.
  Verified: clean `npm run build` re-run during this closeout story (after deleting
  `app/dev-preview-model3d/`), `/components/model3d` present as a static route in the
  output.
- [x] Given the `<Model3D>` showcase page visited with no passcode, when loaded, then it
      renders the sample glTF and is orbit-controllable, with no redirect to
      `/enter-passcode`.
  Verified: `app/(showcase)/components/model3d/page.tsx` is not under any
  `GATED_PATH_PREFIXES` entry — confirmed by reading `lib/gate.ts` and `middleware.ts`
  directly (`GATED_PATH_PREFIXES = ["/tours", "/properties"]`,
  `config.matcher = ["/tours/:path*", "/properties/:path*"]`, neither matches
  `/components/*`). `model3d-showcase-pages`'s Playwright pass loaded the page with no
  passcode cookie set and confirmed no redirect occurred.
- [x] Given `ModelDef`, when inspected, then it carries no `scale`/`position`/
      geo-anchoring *transform* fields.
  Verified: `components/Model3D/Model3D.tsx`'s `ModelDef` interface is
  `{id: string; url: string; title: string; unitsPerMeter?: number}`. The one field
  added since this criterion was first written (`unitsPerMeter`, by the
  `brand-theming-and-viewer-polish` epic) is a measure-tool label-formatting hint, not a
  transform — it doesn't move, resize, or reorient the mesh in any scene. Still matches
  the `do_not` in `model3d-component.yaml` and the reasoning in `design-discussion.md`
  §2.3, reproduced above under "Deliberately deferred."

### Measure tool + controls legend — acceptance criteria

Scoped to the `brand-theming-and-viewer-polish` epic's `model3d-measure-tool-and-legend`
story. See "Measure tool + controls legend" above for the full behavior description.

- [x] Given the Measure toggle is on, when the user clicks two distinct points on the
      mesh, then a connecting line and a distance-labeled midpoint marker render, and the
      label reads "X.XX units" (not a fabricated real-world unit) unless the `ModelDef`
      supplies `unitsPerMeter`.
  Verified: `distanceBetweenPoints`/`formatDistance` (`components/Model3D/Model3D.tsx`)
  are pure, WebGL-independent functions with direct unit coverage in
  `Model3D.test.tsx`. Live-verified via Playwright against the real running app:
  toggling Measure and placing two points on the sample duck produced a distance line
  and a `"0.50 units"` label.
- [x] Given measure mode is active, when the user drags to orbit, then no measure point
      is placed (orbit and measure don't conflict).
  Verified: `MeasureController`'s click-vs-drag threshold (`CLICK_MAX_MOVEMENT_PX`,
  `CLICK_MAX_DURATION_MS`) gates point placement on `pointerup`, and it never calls
  `stopPropagation`/`preventDefault`, so `<OrbitControls>`'s own native drag listeners on
  the same canvas element are unaffected either way. Live-verified via Playwright
  (drag-to-orbit while measure mode is on does not add a point).
- [x] Given two points already placed, when a third point is clicked, then the old pair
      clears and a fresh measurement starts at the new point; independently, the
      "Clear measurement" button resets the same state on demand.
  Verified: `handlePlacePoint`'s `prev.length >= 2 ? [point] : [...prev, point]` reset
  (third-click behavior) and the legend's `handleClearMeasurement`/"Clear measurement"
  button (`disabled` when `points.length === 0`) both call the same `setPoints` reset —
  read directly in `components/Model3D/Model3D.tsx`.
- [x] Given a point is placed, when the camera is observed, then it does not
      unexpectedly re-frame or zoom.
  Verified: `MeasureOverlay`'s markers/line render as `<Canvas>`-level siblings of
  `<Bounds fit clip observe margin={1.2}>`, never as its children — `<Bounds>`'s own
  wrapping `<group>` applies no transform of its own (confirmed by reading
  `@react-three/drei`'s `Bounds.js` directly), so measure geometry can't grow the bounds
  computation `observe` reacts to. Live-verified via Playwright: placing two points left
  the duck pixel-identical in position/scale before and after.
- [x] Given the showcase page, when it loads, then an on-canvas controls legend is
      visible, listing orbit/zoom and the Measure controls, themed via this epic's
      design tokens.
  Verified: `Model3D.tsx`'s legend panel (`bg-surface/90`, `border-border`,
  `text-foreground`, `text-accent`) renders unconditionally in the returned JSX, not
  gated behind any loaded/ready state. Live-verified via Playwright: the "Controls"
  panel with a "Measure" toggle is visible on `/components/model3d` by default.

## Phase fit

- **P1 (this epic):** `<Model3D>` renders a single free-floating glTF mesh, auto-framed,
  orbit-controllable, shown on its own public showcase page. `ModelDef` deliberately
  minimal (`{id, url, title}`).
- **P2 (land-overlay epic, next in priority order):** geo-anchored placement — a NEW type
  (not a field bolted onto `ModelDef`) that anchors a mesh onto `<LayerViewer>`'s map by
  lat/lon/alt, resolving the scene-space-vs-geo-space `position` question this epic
  deliberately left open. CBA's Phase 2/2.5D drape work (`MeasureTool`, `AnnotationLayer`,
  `CompareSwipe`, `AlignControl`) is a separate, `<LayerViewer>`-side track, not owned by
  `<Model3D>`.
- **P3 (per CBA):** point-cloud rendering (potree/COPC) as an alternative or companion
  data source to the glTF mesh path this epic ships.
- **Later (per the operator's 2026-08-07 vision expansion, `CLAUDE.md`):** `<Model3D>` is
  the confirmed foundation for the 3D-on-land overlay, the Minecraft voxelizer/content
  engine, and telemetry-driven video overlay work queued after it.

## Real data update (2806 Prado, real georeferenced-fix story)

The showcase's primary sample swapped from the Khronos duck to a REAL textured mesh:
`public/model3d-samples/prado/model.glb`, the operator's own 2806 Prado St nadir-grid
photogrammetry (OpenDroneMap `odm_texturing_25d` output). Pipeline: `obj2gltf` (raw OBJ →
glTF) → `@gltf-transform/cli resize` (textures to 512px) → a small custom axis-correction
script (rotates the raw ODM export's Z-up convention to glTF's standard Y-up — needed
because `useGLTF`/`OrbitControls` assume Y-up; without it the mesh rendered edge-on by
default, confirmed live via Playwright) → `@gltf-transform/cli draco` (mesh compression).
Net: ~29MB raw export → ~2MB committed asset, geometry/vertex counts unchanged
(gltf-transform inspect confirmed before/after).

**Read this before assuming the default view looks "broken":** the mesh is REAL, low
`--pc-quality`/`--feature-quality` ODM output from a NADIR-ONLY flight (no oblique/
side-facing passes) — solid, coherent surface data when viewed top-down, but no
reconstructed vertical walls, so a 3/4 diagonal angle (the fixed default camera at
`Canvas`'s `camera={{position:[3,3,3]}}`) shows sparse, jagged fragments where you're
seeing through gaps between disconnected patches. Drag to orbit toward a top-down angle for
the real, coherent view. This is an honest characteristic of the source capture
(CLAUDE.md's own "visual property-intelligence, NOT survey-grade" framing made visible),
not a rendering bug — verified by comparing `gltf-transform inspect`'s vertex/face counts
before and after compression (identical) and by live-orbiting the actual showcase page.

The original `public/model3d-samples/duck/model.glb` stays in the repo — `<LandOverlay>`'s
showcase still uses it (see that component's own doc for why the real mesh wasn't swapped
in there too).
