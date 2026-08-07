"use client";

// TEMPORARY — this route exists only to live-verify <LayerViewer> +
// <LayerControl> against the real sample manifest before the real gated
// `/properties/[slug]` route exists (that's layer-viewer-gated-route-
// integration's job). Same precedent as video-tour's core-components story
// used (a temporary app/dev-preview/page.tsx). Delete this route once the
// real gated route lands and covers the same verification.

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { LayerControl } from "@/components/LayerViewer";
import type { LayerDef, LayerViewerHandle } from "@/components/LayerViewer";

// <LayerViewer> is the heavy client-side viewer (MapLibre GL touches
// window/canvas at construction) — CLAUDE.md's "every heavy viewer =
// next/dynamic({ssr:false})" convention applies here too.
const LayerViewer = dynamic(() => import("@/components/LayerViewer").then((mod) => mod.LayerViewer), {
  ssr: false,
});

const SAMPLE_MANIFEST_URL = "/layer-viewer-samples/2806-prado/layers.json";

export default function DevPreviewLayersPage() {
  const viewerRef = useRef<LayerViewerHandle>(null);
  const [layers, setLayers] = useState<LayerDef[]>([]);

  return (
    <main className="relative h-screen w-screen bg-black">
      <LayerViewer ref={viewerRef} manifest={SAMPLE_MANIFEST_URL} onLayersChange={setLayers} />
      <div className="pointer-events-auto absolute right-3 top-3">
        <LayerControl
          layers={layers}
          onToggle={(id, toggle) => viewerRef.current?.toggleLayer(id, toggle)}
          onOpacityChange={(id, opacity) => viewerRef.current?.setOpacity(id, opacity)}
        />
      </div>
    </main>
  );
}
