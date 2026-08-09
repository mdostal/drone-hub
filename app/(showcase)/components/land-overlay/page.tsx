"use client";

// Public showcase page for <LayerViewer>'s `models` prop — the land-overlay
// epic's payoff: a geo-anchored glTF model draped onto the same georeferenced
// map surface as the ortho/hillshade/boundary layers, via
// lib/maplibre-model-layer.ts's custom-layer engine
// (components/LayerViewer/LayerViewer.tsx's `models?: GeoAnchoredModel[]`).
//
// Deliberately a SEPARATE page from /components/layer-viewer (not modified by
// this story) — that page demonstrates the base LayerViewer; this is a
// distinct capability worth its own showcase, same reasoning Model3D got its
// own page instead of being bolted onto LayerViewer's.
//
// Public, ungated — this whole repo carries no gating of any kind (see
// CLAUDE.md's "Scope boundary" section).
//
// public/layer-viewer-samples/2806-prado/ is real photogrammetry from the
// operator's own property, released for public use by the operator (see
// the UPDATE comment below SAMPLE_MODEL_SCALE for the full provenance).
// public/model3d-samples/duck/model.glb is the same generic sample glTF
// <Model3D>'s showcase page previously used exclusively — no new asset
// sourcing, no rights concern for the duck itself.
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { ComponentShowcase } from "@/components/showcase";
import { LayerControl } from "@/components/LayerViewer";
import type { LayerDef, LayerViewerHandle } from "@/components/LayerViewer";
import type { GeoAnchoredModel } from "@/lib/geo-model-types";
import { withBasePath } from "@/lib/base-path";

// <LayerViewer> is the heavy client-side viewer (MapLibre GL touches
// window/canvas at construction) — CLAUDE.md's "every heavy viewer =
// next/dynamic({ssr:false})" convention, same as
// app/(showcase)/components/layer-viewer/page.tsx.
const LayerViewer = dynamic(() => import("@/components/LayerViewer").then((mod) => mod.LayerViewer), {
  ssr: false,
});

// Placed at the sample parcel boundary's centroid
// (public/layer-viewer-samples/2806-prado/parcel.geojson's rectangle),
// computed during epic planning, so the model sits inside the parcel
// outline once the camera is actually looking at that real location.
//
// UPDATE (2026-08-08): the COG-bounds bug this comment used to describe
// (ortho.tif's EPSG:32621 pixel values misread as EPSG:3857, auto-fit
// landing off the coast of Norway instead of this parcel) is FIXED — the
// sample ortho.tif/hillshade.tif were reprojected to EPSG:3857 ahead of
// time. <LayerViewer>'s auto-fit now lands directly on this parcel/duck by
// default, no pan/zoom workaround needed. Full root-cause writeup:
// docs/components/land-overlay.md's "Fixed" section.
//
// UPDATE (2026-08-08, layerviewer-sample-dataset-overhaul): the sample
// ortho.tif was fully replaced — the old file was a single-band uint16
// rio-tiler test fixture (near-solid-black when rendered) at ~73.47°N in
// the high Arctic. It's now a real 3-band RGB drone orthophoto (cropped
// from an OpenAerialMap CC-BY 4.0 image), which naturally sits at a real
// small extent in South Carolina, ~33.35°N/-81.27°W.
//
// UPDATE (real georeferenced-fix story): the sample ortho/hillshade/
// parcel/contours were replaced AGAIN — this time with the operator's own
// real 2806 Prado St photogrammetry (real nadir-grid flight, real
// OpenDroneMap reconstruction, real GPS georeferencing after fixing the
// prior run's missing EXIF-GPS-on-extracted-frames bug — see
// docs/components/layer-viewer.md's provenance section for the full
// writeup). The property's own owner explicitly cleared this real data for
// use in this public framework repo (full release rights — distinct from
// the separate professional real-estate-shoot photos CLAUDE.md's stricter
// release-forms rule still covers). New real extent: ~30.262°N/-97.708°W
// (Austin, TX), the new parcel's centroid, below.
//
// `scale` — kept at the same `10` empirically verified against the prior
// (smaller, ~29m x 53m) parcel rather than the duck being swapped for the
// real reconstructed mesh here: the real textured mesh (
// public/model3d-samples/prado/model.glb, now used by <Model3D>'s own
// showcase) is Z-up in its raw ODM/OBJ export, not glTF's standard Y-up —
// createModelLayer's fixed Y-up -> Mercator-Z-up correction would rotate
// it onto its side without a real axis-correction pass this story didn't
// budget for. The duck is already correctly Y-up and pre-verified, so it
// stays the LandOverlay demo model; only its anchor moved to the new real
// location. `scale` (lib/geo-model-types.ts) is a multiplier on top of
// createModelLayer's meters-per-glTF-unit conversion. The sample duck glTF
// (public/model3d-samples/duck/model.glb, the classic Khronos "Duck"
// sample) is authored in oversized raw units — its glTF position accessor's
// min/max (read directly from the .glb's JSON chunk, not guessed) span
// roughly 165 x 154 x 115 raw units.
//
// Original tuning history (against the OLD, larger parcel): the story's
// starting guess of `scale: 5` and this file's earlier `scale: 0.1` were
// both tested live: at 0.1 the duck was a genuine sub-pixel speck (a
// 100x100 CSS-px pixel sample centered exactly on its projected anchor
// found only the parcel's fill color, zero duck pixels — confirmed via
// canvas.toDataURL() readback, not just a visual guess). At `scale: 50`
// (tested to bound the search from the other side) it was oversized,
// covering most of the parcel. `scale: 10` landed in between: a clearly
// visible, recognizably duck-shaped silhouette occupying roughly 15-20% of
// the OLD parcel's ~120m width.
//
// (Previously observed against the old sample data: it rendered as a
// solid black silhouette, not the duck's usual yellow, for lack of a light
// source. Re-observed live against the new ortho: the duck now renders
// with visible yellow/orange coloring, not solid black — createModelLayer's
// lighting setup is pre-existing behavior in lib/maplibre-model-layer.ts,
// unrelated to this story's sample-data change and out of scope here.)
const SAMPLE_MODEL_SCALE = 10;

const SAMPLE_MODELS: GeoAnchoredModel[] = [
  {
    id: "duck",
    url: withBasePath("/model3d-samples/duck/model.glb"),
    title: "Duck (sample glTF)",
    lat: 30.2618978800391,
    lon: -97.7081778061722,
    altitudeMeters: 0,
    scale: SAMPLE_MODEL_SCALE,
  },
];

const USAGE_CODE = `import { LayerViewer, LayerControl } from "@/components/LayerViewer";
import type { LayerDef, LayerViewerHandle } from "@/components/LayerViewer";
import type { GeoAnchoredModel } from "@/lib/geo-model-types";

const viewerRef = useRef<LayerViewerHandle>(null);
const [layers, setLayers] = useState<LayerDef[]>([]);

const models: GeoAnchoredModel[] = [
  {
    id: "duck",
    url: "/model3d-samples/duck/model.glb",
    title: "Duck (sample glTF)",
    lat: 30.2618978800391,
    lon: -97.7081778061722,
    altitudeMeters: 0,
    scale: ${SAMPLE_MODEL_SCALE},
  },
];

<LayerViewer
  ref={viewerRef}
  manifest="/layer-viewer-samples/2806-prado/layers.json"
  models={models}
  onLayersChange={setLayers}
/>
<LayerControl
  layers={layers}
  onToggle={(id, toggle) => viewerRef.current?.toggleLayer(id, toggle)}
  onOpacityChange={(id, opacity) => viewerRef.current?.setOpacity(id, opacity)}
/>`;

// Mirrors app/(showcase)/components/layer-viewer/page.tsx's ref-handle wiring
// pattern exactly — <LayerViewer>'s `models` prop is additive to that same
// wiring, not a replacement for it.
export default function LandOverlayShowcasePage() {
  const viewerRef = useRef<LayerViewerHandle>(null);
  const [layers, setLayers] = useState<LayerDef[]>([]);

  // Dev-only test hook: land-overlay-test-suite's numeric placement checks
  // (lib/maplibre-model-layer.placement.test.ts) need Playwright's
  // page.evaluate to reach the LIVE MapLibre `Map` instance (for
  // `map.project()`/`map.setPitch()`/`map.setBearing()` — the design
  // discussion's required verification method, see that doc's
  // "verification" section), and a `page.evaluate` callback runs in the
  // browser with no access to this component's React ref. Re-runs every
  // render (cheap — one property assignment) so it stays current across
  // the ref's null -> LayerViewerHandle transition once <LayerViewer>
  // mounts, instead of only firing once via an empty dependency array.
  // Gated out of production bundles — this is a test/dev escape hatch, not
  // a public API this page's real visitors should see on `window`.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    (window as unknown as { __layerViewerHandle?: LayerViewerHandle | null }).__layerViewerHandle =
      viewerRef.current;
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 p-8">
      <ComponentShowcase
        title="LandOverlay"
        description="A geo-anchored 3D model draped onto <LayerViewer>'s map, positioned by real lat/lon alongside the ortho/hillshade/boundary layers."
        demo={
          <div className="relative h-[480px] w-full overflow-hidden rounded-xl bg-background">
            <LayerViewer
              ref={viewerRef}
              manifest={withBasePath("/layer-viewer-samples/2806-prado/layers.json")}
              models={SAMPLE_MODELS}
              onLayersChange={setLayers}
            />
            <div className="pointer-events-auto absolute right-3 top-3">
              <LayerControl
                layers={layers}
                onToggle={(id, toggle) => viewerRef.current?.toggleLayer(id, toggle)}
                onOpacityChange={(id, opacity) => viewerRef.current?.setOpacity(id, opacity)}
              />
            </div>
          </div>
        }
        code={USAGE_CODE}
      />
    </main>
  );
}
