# Design Discussion — `<Model3D>` + component docs-site

## 0. Prelude

**NORTH STAR / PRIOR DECISIONS**: goal is plug-and-play components importable
into mdostal.com; no architectural split between component-library and app
scale; local-first sample data, R2 later; every heavy viewer
`next/dynamic({ssr:false})`; gating via `middleware.ts`+`lib/gate.ts`
(one global passcode, `GATED_PATH_PREFIXES`); Vitest+RTL for tests.

**Operator vision expansion (2026-08-07, captured in CLAUDE.md)**: this is a
component *framework* (shadcn-style) — every component needs a showcase page
(demo + samples + docs). Confirmed priority: `<Model3D>` (foundation) → 3D-on-
land overlay → Minecraft voxelizer/content-engine → telemetry-driven video
overlay → CBA's original Phase 2 tools.

## 1. Goal

Ship two things together, deliberately in one epic: `<Model3D>` (CBA's Phase-3
component — glTF mesh viewer, orbit controls) AND the component-framework
docs-site pattern (shadcn-style: a page per component with live demo + docs),
retrofitting `<VideoTour>`/`<LayerViewer>` into it so the pattern is proven
against 3 real components immediately, not designed in the abstract.

## 2. Proposed approach

1. **Docs-site shell — public, NOT gated.** A new route area
   (`app/(showcase)/components/` or similar — App Router route group so it
   shares no layout with the gated `/tours`, `/properties` surfaces) listing
   every component with a card (name, one-line description, link) and a
   per-component page (`/components/video-tour`, `/components/layer-viewer`,
   `/components/model3d`) rendering: a live demo, a short "why/what" blurb,
   and a usage code snippet.

   **Explicit decision: the showcase pages are public, not behind
   `middleware.ts`'s passcode gate.** Gating exists to protect *real,
   un-released property data* (CLAUDE.md's hard rule). If a component's demo
   only needs sample/placeholder data that's already public, there's nothing
   to protect and gating it would contradict the "drop into mdostal.com,
   showcase the components" goal.

   **CORRECTED after grill — per-component sample-data rights status is NOT
   symmetric, and the original draft got this wrong:**
   - `<LayerViewer>`'s demo → safe to reuse `public/layer-viewer-samples/
     2806-prado/layers.json` as-is. That data is already outside
     `GATED_PATH_PREFIXES` and was built specifically as synthetic/public-
     source sample data (rio-tiler's own test-fixture COG; a clearly-labeled
     synthetic hillshade; a synthetic, non-address parcel boundary).
   - `<Model3D>`'s demo → a fresh public-domain glTF (see below), no rights
     issue.
   - `<VideoTour>`'s demo → **CANNOT reuse `public/tours/2806-prado/
     tour.json`.** That path sits inside `middleware.ts`'s
     `GATED_PATH_PREFIXES` (`/tours/*`) for a real reason: it's real
     photography of Mathew's actual, currently-listed address, and
     `docs/components/video-tour.md` itself says it's "private until Mathew
     flips a tour to public." Reusing it on an ungated showcase page would
     be exactly the "deploy un-released assets un-gated" CLAUDE.md forbids —
     the original draft treated this as symmetric with LayerViewer's sample
     data and was wrong to. **Fix:** the VideoTour showcase story sources a
     SEPARATE, genuinely public-safe demo tour — a small set of clearly
     generic/stock or placeholder room images (not Mathew's real Prado
     photos, not any real address), reproducing the video-tour.md room-graph
     shape with fictional content. The real, gated `/tours/2806-prado` route
     is unaffected and stays exactly as gated as it is today.

2. **A small shared `<ComponentShowcase>` layout component** (title,
   description, demo slot, code-snippet slot) — purely presentational, no
   opinion about gating. This is deliberate: the *route* decides public vs.
   gated (which layout wraps the page), not the component. That's what lets
   the same `<ComponentShowcase>` be reused later inside the gated
   content-engine page (queued next in priority order) without a rebuild —
   grill flagged this as unresolved; resolving it now rather than later.

3. **`<Model3D>`** — `'use client'`, `@react-three/fiber` + `@react-three/drei`
   (both locked, unused until now) Canvas, `useGLTF` (drei) to load a glTF/
   glb mesh, `OrbitControls` for orbit/zoom/pan. `ModelDef {id, url, title}`
   — deliberately NOT including `scale`/`position` in this epic's type
   (grill correctly flagged that a scene-space vs. geo-space `position` would
   likely need rework the moment land-overlay lands next). P1 is a single
   free-floating model in its own scene, framed by `OrbitControls` — no
   placement semantics needed yet. Geo-anchored placement (lat/lon onto
   `<LayerViewer>`'s terrain) is explicitly a NEW, separate type in the next
   epic (land-overlay), not a field bolted onto `ModelDef` now. Sample data:
   a small public-domain glTF from Khronos's own `glTF-Sample-Models` repo
   (verified reachable: `Duck.glb`, ~120KB, CC0-equivalent per that repo's
   license) — good fit: small, real glTF, exercises the exact loader path a
   real WebODM-exported mesh will use later.

4. **`<Model3D>`'s own showcase page** — proves the pattern extends cleanly
   to a brand-new component on day one, not just retrofitted onto old ones.

## 3. Scale assessment

**Medium.** New cross-cutting infrastructure (docs-site shell + shared
showcase layout) plus a new component family, but bounded — no new gating/
test infra needed (both reused as-is; showcase pages need NO gating, which
removes a dimension of complexity relative to prior epics). H/V slice
planning applies; structured outline does not.

## 4. Risks

- **Public showcase pages must never accidentally leak real data.** Resolved
  above (not a residual risk, a caught-and-fixed one): the VideoTour showcase
  gets its own genuinely-public demo dataset, never the real Prado tour. The
  discipline going forward — "a showcase page's demo data must independently
  qualify as public-safe, never assumed-safe by association with another
  component's sample data" — is worth keeping in `.pHive/CONTEXT.md` as a
  standing convention (see docs-closeout story).
- **`@react-three/fiber`/`drei` vs. React 19 peer range** — same class of
  issue the app-shell-scaffold story already hit and worked around
  (`.npmrc`'s `legacy-peer-deps=true`) for `@react-three/fiber` itself; drei
  may have its own peer constraints, re-verify rather than assume the
  existing workaround covers it.
- **LayerViewer's showcase demo fetches its sample manifest directly**
  (`public/layer-viewer-samples/2806-prado/layers.json`), not through the
  gated `/properties/[slug]` route — confirmed safe since that data already
  sits outside `GATED_PATH_PREFIXES`. VideoTour's showcase demo does the same
  against its NEW, separate public demo manifest (not `/tours/[slug]`, and
  not the real `public/tours/2806-prado/` path at all).

## 5. Dependencies

- None on Phase-0 (sample data only, same pattern as prior epics).
- Land-overlay, Minecraft voxelizer, and telemetry video-overlay (queued next
  per the confirmed priority order) all depend on `<Model3D>` existing first
  — this epic is the literal foundation for all three.

## 6. Decisions made without a blocking gate (operator asked to keep moving)

1. Showcase route group is public/ungated — reasoned above, not re-litigated
   per story.
2. `ModelDef` registry kept deliberately simple (no multi-texture/point-cloud
   layering yet) — CBA itself phases point-cloud in later.
3. Sample model: Khronos `glTF-Sample-Models`' `Duck.glb` — small, real,
   permissively licensed, directly exercises the glTF-loading path.
