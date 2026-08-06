# Drone platform — cost-benefit analysis + build plan

_Multi-agent CBA, 2026-08-05. Source of truth for the hive kickoff._

## Verdict
**BUILD & self-host the viewer; BUY only the compute you can't cheaply own; NEVER embed the SaaS** (an iframe is the opposite of owning reusable components + high lock-in). Ship the **pragmatic MVP this week** on a typed **layer-registry** so it IS phase-1 of the full owned stack — no throwaway.

| Approach | eff | cap | fit | total | notes |
|---|---|---|---|---|---|
| Embed SaaS as product surface | 2 | 6 | 4 | **3** | Fails the goal (no owned components), HIGH lock-in. Rejected as surface; OK only as processing backend/demo. |
| Self-host WebODM + full custom viewer | 8 | 9 | 8 | **7** | Correct end-state, max capability, but ~3–5 wks — phase-3 target, over-scoped to start. |
| Build viewer from libs (glTF first, defer point cloud) | 6 | 8 | 9 | **8** | Right architecture for owned IP; ~2–3 wk MVP; phase-2 backbone. |
| **Pragmatic solo MVP this week** | 3 | 6 | 10 | **9** | **STARTING POINT.** MapLibre layer viewer (satellite+ortho+hillshade+parcel) + video annotator + 2.5D DSM drape, PMTiles on R2. Ships with gear he owns, bandwidth-safe, every component real. |

## Buy vs Build (per capability)
- **Ortho/photogrammetry:** BUY-as-compute — WebODM (self-host free when dev box returns; **WebODM Lightning ~$20–40/property** as the unblock now). Never write SfM. Hammer $49/mo = optional demo embed only.
- **Map layer viewer:** BUILD — the owned IP. MapLibre source/layer = toggle+opacity 1:1.
- **3D viewer:** BUILD — r3f glTF mesh + raycast measure now; point-cloud (COPC/Potree) deferred, isolated.
- **Thermal:** DEFER (no sensor) — build the disabled slot only.
- **Video annotation:** BUILD/REUSE his existing shape-on-video module.
- **Tiling:** BUILD — free GDAL/rio-pmtiles/rio-cogeo scripts (static output, no tile server).
- **Storage/CDN:** BUY — **Cloudflare R2** ($0.015/GB-mo, ZERO egress). This is the Vercel-bandwidth answer.
- **Basemap:** free — Esri World Imagery (attribution) or MapTiler free tier, no token.

## Components (owned, plug-and-play)
- **`MapLayerViewer`** — MapLibre driven by a typed layer registry `{id,type,url,opacity,toggle}`; satellite base + ortho + hillshade + thermal(slot) + contours + parcel. **The killer feature.**
- **`LayerControl`** — shadcn toggle + opacity-slider panel.
- **`AlignControl`** — manual affine nudge (translate/rotate/scale) to snap ortho onto satellite/parcel; **the no-RTK workaround (mandatory).**
- **`MeasureTool`** — terra-draw + turf → distance/area (directional, not survey-grade).
- **`AnnotationLayer`** — draw/persist shapes/points/labels to `annotations.json` on R2.
- **`CompareSwipe`** — two-date before/after swipe.
- **`Model3DViewer`** — r3f glTF mesh + OrbitControls + raycast measure (point cloud phase-3).
- **`VideoAnnotator`** — port his existing draw-on-video code to `{src, annotations, onChange}`.
- **`GalleryCarousel`** — shadcn/embla + tag/altitude/AI-confidence filter chips.
- **`FeedPlayer`** — hls.js footage/live-feed.
- **`Legend/ColormapRamp`** — thermal ironbow legend, disabled until data.

## Build phases
0. **DATA GATE (do first — the real blocker):** fly ONE nadir grid pass (~75/70% overlap, camera straight down) over 2806 Prado / an Omaha lot → WebODM → reference ortho/DSM/mesh. Without this the hive builds empty viewers.
1. **MVP this week:** monorepo + `/pipeline` SOP; MapLayerViewer + LayerControl + VideoAnnotator + GalleryCarousel; tiles as PMTiles on R2.
2. **Interaction:** MeasureTool + AnnotationLayer + CompareSwipe + AlignControl + 2.5D terrain drape.
3. **True 3D:** Model3DViewer glTF + measure; then point cloud (COPC/Potree) behind `next/dynamic`.
4. **Thermal + AI:** activate when a radiometric sensor is acquired (identical pipeline → flip `disabled:false`).

## Thermal path
Defer capture, architect the slot now. `type:'raster', legend:'ironbow', disabled:true` in the registry. Later = separate capital call (RENT/partner first, then Mavic 3T ~$5–6k), only when a paying use-case justifies it. Zero component rework — the layer registry's payoff.

## Risks (top)
- **Capture gap (#1):** his obliques won't photogrammetrically align — needs nadir grid passes. Behavior change, not tooling.
- **Mini 5 Pro SDK:** DJI locks Mini-class SDK — verify Litchi/Dronelink control the 5 Pro before buying (~$25); worst case = manual lawnmower.
- **No RTK/GCP → 1–3m drift:** AlignControl mandatory; frame output as **visual property-intelligence, NOT survey-grade.**
- **Compute box MIA:** WebODM wants 16–32GB RAM → cloud VM or Lightning. Open blocker (is the dev machine / git backup sorted?).
- **Bundle bloat + Vercel bandwidth:** every heavy viewer `next/dynamic({ssr:false})`; heavy bytes on R2 only — route one big asset through Vercel = surprise bill.
- **Subscription bleed + scope creep:** resist SaaS ($588–3,948/yr) for what WebODM does free; thermal/point-cloud/compare are stubbed slots at kickoff, not phase-1.
