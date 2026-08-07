"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useRef, useState } from "react";
import { LayerControl } from "@/components/LayerViewer";
import type { LayerDef, LayerViewerHandle } from "@/components/LayerViewer";

// <LayerViewer> is the heavy client-side viewer (MapLibre GL touches
// window/canvas at construction) — CLAUDE.md's "every heavy viewer =
// next/dynamic({ssr:false})" convention applies here, same as
// app/tours/[slug]/page.tsx does for <VideoTour>.
const LayerViewer = dynamic(() => import("@/components/LayerViewer").then((mod) => mod.LayerViewer), {
  ssr: false,
});

// This page is itself a Client Component (rather than a Server Component
// reading the `params` prop directly) specifically so that `ssr: false` is
// legal to pass to next/dynamic: Next's App Router rejects `ssr: false` on
// next/dynamic when it's called from a Server Component. Same workaround as
// app/tours/[slug]/page.tsx.
//
// Gating for the whole /properties/* tree (this route + the manifest/asset
// fetch below) is enforced server-side by middleware.ts before this page is
// ever reached — see middleware.ts's matcher: ["/tours/:path*",
// "/properties/:path*"]. This component intentionally contains zero
// passcode/session logic of its own; it just resolves `slug`, hands
// <LayerViewer> a manifest URL, and wires the ref-handle pattern documented
// in components/LayerViewer/index.ts's header comment to <LayerControl>.
export default function PropertyPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const viewerRef = useRef<LayerViewerHandle>(null);
  const [layers, setLayers] = useState<LayerDef[]>([]);

  return (
    <main className="relative h-screen w-screen bg-black">
      <LayerViewer
        ref={viewerRef}
        manifest={`/layer-viewer-samples/${slug}/layers.json`}
        onLayersChange={setLayers}
      />
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
