"use client";

// TEMPORARY dev-only preview route for live-verifying <Model3D> against the
// real sample glb via Playwright (mesh actually renders, OrbitControls
// actually rotates/zooms) — same precedent as the VideoTour/LayerViewer
// core-components stories' own dev-preview routes. Not gated, not linked
// from anywhere, not part of the plug-and-play component surface itself.
// A later story (this epic's showcase-page work) may supersede this route;
// safe to delete once that lands.
import dynamic from "next/dynamic";

// <Model3D> is a heavy client-only viewer (WebGL canvas via
// @react-three/fiber) — CLAUDE.md's "every heavy viewer =
// next/dynamic({ssr:false})" convention, same as the LayerViewer/VideoTour
// dev-preview routes.
const Model3D = dynamic(() => import("@/components/Model3D").then((mod) => mod.Model3D), {
  ssr: false,
});

export default function DevPreviewModel3DPage() {
  return (
    <main className="h-screen w-screen bg-neutral-900">
      <Model3D model={{ id: "duck", url: "/model3d-samples/duck/model.glb", title: "Sample Duck" }} />
    </main>
  );
}
