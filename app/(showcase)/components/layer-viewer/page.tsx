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
// <CompareSwipe>/<AlignControl> — layerviewer-phase2-tools epic's two
// SEPARATE sibling components (see docs/components/layer-viewer.md's "Phase
// 2 tools" section for why they're siblings rather than built into
// <LayerViewer> the way Measure/Annotate are). Each owns its own extra
// MapLibre `Map` instance(s) at construction, same "touches window/canvas"
// reasoning as <LayerViewer> itself — dynamic-imported the same way.
const CompareSwipe = dynamic(() => import("@/components/LayerViewer").then((mod) => mod.CompareSwipe), {
  ssr: false,
});
const AlignControl = dynamic(() => import("@/components/LayerViewer").then((mod) => mod.AlignControl), {
  ssr: false,
});

// Which of the two mutually-exclusive extra overlays (if any) is currently
// shown — mirrors <LayerViewer>'s OWN internal Measure/Annotate mutual
// exclusion (see LayerViewer.tsx's `annotationModeRef` comment): both
// <CompareSwipe> and <AlignControl> are full-bleed absolutely-positioned
// overlays, so showing both at once would visually collide (two divider/
// ghost-pane overlays stacked on top of each other) even though nothing
// about their own click-handling would technically conflict the way
// Measure/Annotate's did. "none" leaves <LayerViewer>'s own Measure/Annotate
// tools as the only interactive overlays, matching this page's pre-Phase-2
// default.
type ExtraTool = "none" | "compare" | "align";

const USAGE_CODE = `import { LayerViewer, LayerControl, CompareSwipe, AlignControl } from "@/components/LayerViewer";
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
{/* Measure + Annotate are built into <LayerViewer> itself — their own
    floating panels (bottom-left / top-left) render automatically, no
    extra wiring needed. They're mutually exclusive: activating one
    turns the other off (see docs/components/layer-viewer.md's
    "Phase 2 tools" section for the click-ownership integration check
    behind that). */}
<LayerControl
  layers={layers}
  onToggle={(id, toggle) => viewerRef.current?.toggleLayer(id, toggle)}
  onOpacityChange={(id, opacity) => viewerRef.current?.setOpacity(id, opacity)}
/>
<button onClick={() => viewerRef.current?.toggleFullscreen()}>
  {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
</button>

{/* Compare and Align are separate siblings — mount them only when a
    consumer wants that overlay, passing the SAME viewerRef + layers. */}
<CompareSwipe viewerRef={viewerRef} layers={layers} layerA="ortho" layerB="hillshade" />
<AlignControl viewerRef={viewerRef} layers={layers} />`;

// Mirrors the ref-handle wiring pattern from app/properties/[slug]/page.tsx:
// LayerViewer and LayerControl are independent siblings, wired together by
// the consumer via a ref handle + layers state (see
// components/LayerViewer/index.ts's header comment).
export default function LayerViewerShowcasePage() {
  const viewerRef = useRef<LayerViewerHandle>(null);
  const [layers, setLayers] = useState<LayerDef[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Compare/Align toggle — see ExtraTool's own comment above for why these
  // two (unlike Measure/Annotate, which are always-on inside <LayerViewer>
  // itself) are mounted conditionally by THIS page, mutually exclusive with
  // each other.
  const [extraTool, setExtraTool] = useState<ExtraTool>("none");

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
        description="Toggleable, opacity-controlled georeferenced overlays draped on a satellite base map — plus click-to-measure, point/line/polygon annotation, a two-layer compare swipe, and a manual GPS-drift alignment nudge."
        demo={
          <div className="relative h-[480px] w-full overflow-hidden rounded-xl bg-background">
            <LayerViewer
              ref={viewerRef}
              manifest={withBasePath("/layer-viewer-samples/2806-prado/layers.json")}
              onLayersChange={setLayers}
              onFullscreenChange={setIsFullscreen}
            />
            {/* Compare/Align — separate siblings, mounted only while
                selected via the toolbar below (mutually exclusive with each
                other, and layered on TOP of <LayerViewer>'s own Measure/
                Annotate panels since neither reaches into the real map the
                way this pair's own ghost/comparison panes do — see
                docs/components/layer-viewer.md's "Phase 2 tools" section). */}
            {extraTool === "compare" && (
              <CompareSwipe viewerRef={viewerRef} layers={layers} layerA="ortho" layerB="hillshade" />
            )}
            {extraTool === "align" && <AlignControl viewerRef={viewerRef} layers={layers} />}
            <div className="pointer-events-auto absolute right-3 top-3 bottom-3 flex flex-col items-end gap-2">
              <button
                type="button"
                onClick={() => viewerRef.current?.toggleFullscreen()}
                aria-pressed={isFullscreen}
                className="shrink-0 rounded-lg border border-border bg-surface/90 px-3 py-1.5 text-xs font-medium text-foreground shadow-lg backdrop-blur transition-colors hover:border-accent hover:text-accent"
              >
                {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              </button>
              {/* Compare/Align toolbar — a small legend/help panel matching
                  <LayerViewer>'s own Measure/Annotate panels' "Toggle X to
                  do Y" wording style (LayerViewer.tsx's Measure panel:
                  "Toggle Measure to place points" / "Click two points to
                  measure"). Toggling one selects it and deselects the
                  other (or clears the selection entirely if the
                  already-active one is clicked again) — same "click active
                  to turn off" affordance <LayerViewer>'s own Annotate
                  toolbar uses. */}
              <div className="flex w-56 flex-col gap-2 rounded-xl border border-border bg-surface/90 p-3 text-xs text-foreground shadow-lg backdrop-blur">
                <span className="font-medium">Compare / Align</span>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Compare or align tool">
                  {(["compare", "align"] as const).map((tool) => (
                    <button
                      key={tool}
                      type="button"
                      onClick={() => setExtraTool((prev) => (prev === tool ? "none" : tool))}
                      aria-pressed={extraTool === tool}
                      className={`rounded-full border px-2 py-1 text-[11px] font-medium capitalize transition-colors ${
                        extraTool === tool
                          ? "border-accent bg-accent text-white"
                          : "border-border text-foreground hover:border-accent hover:text-accent"
                      }`}
                    >
                      {tool}
                    </button>
                  ))}
                </div>
                {extraTool === "compare" && <span className="text-muted">Drag the divider to compare ortho vs. hillshade</span>}
                {extraTool === "align" && <span className="text-muted">Use the D-pad to nudge the selected layer's GPS registration</span>}
                {extraTool === "none" && <span className="text-muted">Toggle Compare or Align to try them</span>}
              </div>
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
