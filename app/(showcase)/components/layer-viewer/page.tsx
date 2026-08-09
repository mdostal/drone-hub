"use client";

// Public showcase page for <LayerViewer> + <LayerControl>. This whole repo
// carries no gating of any kind (see CLAUDE.md's "Scope boundary" section).
//
// public/layer-viewer-samples/2806-prado/layers.json is synthetic sample
// data (not real property photogrammetry) — see docs/components/layer-viewer.md's
// "Sample data provenance" section for exactly what's real vs. synthetic in it.
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
const [isFullscreen, setIsFullscreen] = useState(false);

<LayerViewer
  ref={viewerRef}
  manifest="/layer-viewer-samples/2806-prado/layers.json"
  onLayersChange={setLayers}
  onFullscreenChange={setIsFullscreen}
/>
<LayerControl
  layers={layers}
  onToggle={(id, toggle) => viewerRef.current?.toggleLayer(id, toggle)}
  onOpacityChange={(id, opacity) => viewerRef.current?.setOpacity(id, opacity)}
/>
<button onClick={() => viewerRef.current?.toggleFullscreen()}>
  {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
</button>`;

// Mirrors the ref-handle wiring pattern from app/properties/[slug]/page.tsx:
// LayerViewer and LayerControl are independent siblings, wired together by
// the consumer via a ref handle + layers state (see
// components/LayerViewer/index.ts's header comment).
export default function LayerViewerShowcasePage() {
  const viewerRef = useRef<LayerViewerHandle>(null);
  const [layers, setLayers] = useState<LayerDef[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);

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
          <div className="relative h-[480px] w-full overflow-hidden rounded-xl bg-background">
            <LayerViewer
              ref={viewerRef}
              manifest={withBasePath("/layer-viewer-samples/2806-prado/layers.json")}
              onLayersChange={setLayers}
              onFullscreenChange={setIsFullscreen}
            />
            <div className="pointer-events-auto absolute right-3 top-3 flex flex-col items-end gap-2">
              <button
                type="button"
                onClick={() => viewerRef.current?.toggleFullscreen()}
                aria-pressed={isFullscreen}
                className="rounded-lg border border-border bg-surface/90 px-3 py-1.5 text-xs font-medium text-foreground shadow-lg backdrop-blur transition-colors hover:border-accent hover:text-accent"
              >
                {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              </button>
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
