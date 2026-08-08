"use client";

// TEMPORARY dev-only preview route for live-verifying <VoxelTerrain> +
// <VoxelStructure> against the real sample heightmap via Playwright
// (terrain actually renders with real height variation, the structure sits
// on top of it at the right cell, OrbitControls actually rotates/zooms,
// instancing is genuinely in use) — same precedent as
// app/dev-preview-model3d/page.tsx (model3d-component story) and the
// VideoTour/LayerViewer core-components stories' own dev-preview routes.
// Not gated, not linked from anywhere, not part of the plug-and-play
// component surface itself. This epic's showcase-page story
// (app/(showcase)/components/voxel-terrain/page.tsx) may supersede this
// route later; safe to delete once that lands.
import dynamic from "next/dynamic";

// Heavy client-only viewer (WebGL canvas via @react-three/fiber) —
// CLAUDE.md's "every heavy viewer = next/dynamic({ssr:false})" convention.
const VoxelPreviewClient = dynamic(() => import("./VoxelPreviewClient"), { ssr: false });

export default function DevPreviewVoxelPage() {
  return (
    <main className="h-screen w-screen bg-neutral-900">
      <VoxelPreviewClient />
    </main>
  );
}
