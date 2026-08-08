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
// This route group is deliberately NOT in lib/gate.ts's GATED_PATH_PREFIXES
// (currently just "/tours" and "/properties") / middleware.ts's matcher,
// same as every other app/(showcase)/components/* page — confirmed live via
// Playwright (see this story's report): loading with no passcode cookie
// renders directly, no redirect to /enter-passcode.
//
// public/layer-viewer-samples/2806-prado/ is already-confirmed public-safe
// synthetic sample data (not real property photography), and
// public/model3d-samples/duck/model.glb is the same generic sample glTF
// <Model3D>'s showcase page already uses — no new asset sourcing, no rights
// concern.
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { ComponentShowcase } from "@/components/showcase";
import { LayerControl } from "@/components/LayerViewer";
import type { LayerDef, LayerViewerHandle } from "@/components/LayerViewer";
import type { GeoAnchoredModel } from "@/lib/geo-model-types";

// <LayerViewer> is the heavy client-side viewer (MapLibre GL touches
// window/canvas at construction) — CLAUDE.md's "every heavy viewer =
// next/dynamic({ssr:false})" convention, same as
// app/(showcase)/components/layer-viewer/page.tsx.
const LayerViewer = dynamic(() => import("@/components/LayerViewer").then((mod) => mod.LayerViewer), {
  ssr: false,
});

// Placed at the sample parcel boundary's centroid
// (public/layer-viewer-samples/2806-prado/parcel.geojson's ~120m x 100m
// rectangle), computed during epic planning, so the model sits inside the
// parcel outline once the camera is actually looking at that real location.
//
// KNOWN LIMITATION (pre-existing, NOT introduced by this story, confirmed
// present on the untouched .../layer-viewer/page.tsx too): <LayerViewer>'s
// auto-fit-to-ortho-bounds does NOT land on this parcel/duck by default.
// public/layer-viewer-samples/2806-prado/ortho.tif is a rio-tiler test COG
// in EPSG:32621 (UTM zone 21N) — verified directly with rasterio, its real
// WGS84 extent is ~73.47°N, ~56.8°W (matching the parcel/duck coordinates
// here). But @geomatico/maplibre-cog-protocol's `RasterTileSource.bounds`
// for this file comes back as lon 3.35-5.74 / lat 58.25-59.49 (off the coast
// of Norway) — live-verified via `map.getSource('layer-ortho').bounds`, and
// the numbers match the Web Mercator (EPSG:3857) inverse-projection of the
// COG's raw UTM *meters*, i.e. the library appears to treat this non-3857
// COG's projected coordinates as if they were already EPSG:3857. Both the
// reported bounds AND the actual tile fetches share this bug, so the ortho
// imagery only ever paints near Norway, never at the real parcel location.
// <LayerViewer> exposes no camera-control prop to work around this from a
// consumer page, and fixing the shared cog-protocol integration is out of
// this story's scope (do_not: don't source new assets; the fix belongs to
// whichever story owns the sample-data/cog-protocol pipeline). Real WebODM
// pipeline output (CLAUDE.md's target pipeline) gets tiled/reprojected
// before it ever reaches <LayerViewer>, so this is a sample-fixture-only
// quirk, not a production concern — but it means: on load, you'll see the
// (mis-located) ortho near Norway, and need to pan/zoom to the real parcel
// coordinates above to see the duck + boundary together. Once there, the
// scale/tracking behavior below is fully verified.
//
// `scale: 10` — live-tuned via Playwright by flying the camera to the real
// parcel coordinates (jumpTo, since fitBounds can't get there itself — see
// above) and reading back actual rendered pixels. `scale`
// (lib/geo-model-types.ts) is a multiplier on top of
// createModelLayer's meters-per-glTF-unit conversion. The sample duck glTF
// (public/model3d-samples/duck/model.glb, the classic Khronos "Duck"
// sample) is authored in oversized raw units — its glTF position accessor's
// min/max (read directly from the .glb's JSON chunk, not guessed) span
// roughly 165 x 154 x 115 raw units. The story's starting guess of `scale:
// 5` and this file's earlier `scale: 0.1` were both tested live: at 0.1 the
// duck was a genuine sub-pixel speck (a 100x100 CSS-px pixel sample
// centered exactly on its projected anchor found only the parcel's fill
// color, zero duck pixels — confirmed via canvas.toDataURL() readback, not
// just a visual guess). At `scale: 50` (tested to bound the search from the
// other side) it was oversized, covering most of the parcel. `scale: 10`
// lands in between: a clearly-visible, recognizably duck-shaped silhouette
// occupying roughly 15-20% of the parcel's ~120m width — present, not a
// speck, not swallowing the frame. (Separately observed: it renders as a
// solid black silhouette, not the duck's usual yellow — createModelLayer's
// three.js scene has no light source, and the glTF's material needs one;
// pre-existing behavior in lib/maplibre-model-layer.ts, unrelated to scale
// and out of this story's scope to change.)
const SAMPLE_MODEL_SCALE = 10;

const SAMPLE_MODELS: GeoAnchoredModel[] = [
  {
    id: "duck",
    url: "/model3d-samples/duck/model.glb",
    title: "Duck (sample glTF)",
    lat: 73.46748426410694,
    lon: -56.808326092516914,
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
    lat: 73.46748426410694,
    lon: -56.808326092516914,
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
          <div className="relative h-[480px] w-full overflow-hidden rounded-md bg-black">
            <LayerViewer
              ref={viewerRef}
              manifest="/layer-viewer-samples/2806-prado/layers.json"
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
