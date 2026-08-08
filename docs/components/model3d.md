# `<Model3D>` — glTF mesh viewer (hive spec)

> Orbit a **3D mesh** (glTF/glb) rendered straight from photogrammetry output — CBA's
> Phase-3 `Model3DViewer`. Plug-and-play, importable into personal-site, publicly
> showcased (not gated — see "The showcase page" below).

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
}

export interface Model3DProps {
  model: ModelDef;
  /** Fired if the glTF fails to load (bad url, network error, parse error). */
  onLoadError?: (message: string) => void;
  className?: string;
}
```

That's the whole registry entry — `{id, url, title}`, no more. This matches what's
actually shipped in `components/Model3D/Model3D.tsx`; there is no separate manifest file
for P1 (a single sample model, hardcoded inline on the showcase page — see "Sample
data" below), unlike `<LayerViewer>`'s `PropertyLayers`/`<VideoTour>`'s `Tour`, which
both do have a manifest-file convention. A single-model P1 scope didn't warrant one; if
a future epic needs to list multiple models per property, that's the point to add one.

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

Scoped to this epic (P1: `<Model3D>` on a single sample glTF, plus the showcase-site
pattern). Measure, point-cloud rendering, and scale/position/geo-anchoring are explicitly
out of scope — see Phase fit.

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
      geo-anchoring fields.
  Verified: `components/Model3D/Model3D.tsx`'s `ModelDef` interface is exactly
  `{id: string; url: string; title: string}` — no other fields. Matches the `do_not` in
  `model3d-component.yaml` and the reasoning in `design-discussion.md` §2.3, reproduced
  above under "Deliberately deferred."

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
