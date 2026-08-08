"use client";

// Public showcase page for <LayerViewer> + <LayerControl> — this route
// group is deliberately NOT in lib/gate.ts's GATED_PATH_PREFIXES /
// middleware.ts's matcher, same as app/(showcase)/components/page.tsx.
//
// public/layer-viewer-samples/2806-prado/layers.json is already confirmed
// public-safe/synthetic sample data (unlike the tours family's real Prado
// photography) — safe to reuse directly here, same manifest
// app/properties/[slug]/page.tsx uses behind the gate.
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { ComponentShowcase } from "@/components/showcase";
import { LayerControl } from "@/components/LayerViewer";
import type { LayerDef, LayerViewerHandle } from "@/components/LayerViewer";
import { withBasePath } from "@/lib/base-path";

// <LayerViewer> is the heavy client-side viewer (MapLibre GL touches
// window/canvas at construction) — CLAUDE.md's "every heavy viewer =
// next/dynamic({ssr:false})" convention, same as app/properties/[slug]/page.tsx.
const LayerViewer = dynamic(() => import("@/components/LayerViewer").then((mod) => mod.LayerViewer), {
  ssr: false,
});

const USAGE_CODE = `import { LayerViewer, LayerControl } from "@/components/LayerViewer";
import type { LayerDef, LayerViewerHandle } from "@/components/LayerViewer";

const viewerRef = useRef<LayerViewerHandle>(null);
const [layers, setLayers] = useState<LayerDef[]>([]);

<LayerViewer
  ref={viewerRef}
  manifest="/layer-viewer-samples/2806-prado/layers.json"
  onLayersChange={setLayers}
/>
<LayerControl
  layers={layers}
  onToggle={(id, toggle) => viewerRef.current?.toggleLayer(id, toggle)}
  onOpacityChange={(id, opacity) => viewerRef.current?.setOpacity(id, opacity)}
/>`;

// Mirrors the ref-handle wiring pattern from app/properties/[slug]/page.tsx:
// LayerViewer and LayerControl are independent siblings, wired together by
// the consumer via a ref handle + layers state (see
// components/LayerViewer/index.ts's header comment).
export default function LayerViewerShowcasePage() {
  const viewerRef = useRef<LayerViewerHandle>(null);
  const [layers, setLayers] = useState<LayerDef[]>([]);

  // Dev-only test hook, same pattern/rationale as
  // app/(showcase)/components/land-overlay/page.tsx's own copy of this
  // effect: land-overlay-test-suite's GL-state-pollution regression
  // (lib/maplibre-model-layer.placement.test.ts) needs a "the model layer
  // never touched this map's GL context at all" reference render of the
  // ortho layer to compare against — THIS page (no `models` prop, ever) is
  // that reference. Gated out of production bundles.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    (window as unknown as { __layerViewerHandle?: LayerViewerHandle | null }).__layerViewerHandle =
      viewerRef.current;
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 p-8">
      <ComponentShowcase
        title="LayerViewer"
        description="Toggleable, opacity-controlled georeferenced overlays draped on a satellite base map."
        demo={
          <div className="relative h-[480px] w-full overflow-hidden rounded-md bg-black">
            <LayerViewer
              ref={viewerRef}
              manifest={withBasePath("/layer-viewer-samples/2806-prado/layers.json")}
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
