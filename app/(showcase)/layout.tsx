import type { ReactNode } from "react";
import { NavStrip } from "@/components/showcase";

// Shared layout for the /components/* and /docs/components/* route groups
// (app/(showcase)/components/** and app/(showcase)/docs/components/**) — a
// slim, always-present nav strip so a visitor can jump directly between
// components instead of backtracking to `/` each time. See
// .pHive/epics/nav-video-pipeline-files/docs/design-discussion.md §3a.
//
// This does NOT apply to the root `/` page (app/page.tsx) — that file lives
// outside the (showcase) route group entirely, so it keeps its own fuller
// table-of-contents (with descriptions) untouched, exactly as the story
// requires ("does NOT replace the root / landing page").
//
// Deliberately a plain, synchronous Server Component: no cookies(),
// headers(), or searchParams — any of those would force
// app/(showcase)/docs/components/[slug]/page.tsx (fully statically
// prerendered today via generateStaticParams) back to dynamic (ƒ)
// rendering. Verified via `next build`'s route table after this change
// (see this story's commit message / PR notes for the exact output). Active
// -route highlighting needs usePathname(), which needs a client boundary —
// that's isolated entirely inside components/showcase/NavStrip.tsx
// ("use client"), not here, so this file itself stays server-rendered and
// the static doc routes are unaffected.
//
// Mirrors app/page.tsx's TOC array's name + live-demo href for all 11
// current components/tools (verified against that file directly, not
// re-derived) — a small, low-churn, hand-mirrored list rather than an
// import, since page.tsx's TOC carries additional fields (description,
// docHref, release note) this strip doesn't need. MinecraftExport has no
// demo page of its own; its live action (the .schem download button) lives
// on the VoxelTerrain demo page, so it points there too — same choice
// page.tsx's own TOC entry note already makes. FileUpload/FileList/
// ProcessingStatus were added by the generic-file-components story
// (nav-video-pipeline-files epic) — see docs/components/file-upload.md,
// file-list.md, processing-status.md. FlightCoverageAnalyzer was added to
// answer a real operator question about the Prado nadir passes — see
// docs/components/flight-coverage-analyzer.md.
const NAV_ITEMS = [
  { name: "VideoTour", href: "/components/video-tour" },
  { name: "VideoAnnotator", href: "/components/video-annotator" },
  { name: "LayerViewer", href: "/components/layer-viewer" },
  { name: "Model3D", href: "/components/model3d" },
  { name: "LandOverlay", href: "/components/land-overlay" },
  { name: "VoxelTerrain", href: "/components/voxel-terrain" },
  { name: "ContentEngine", href: "/properties/2806-prado/engine" },
  { name: "MinecraftExport", href: "/components/voxel-terrain" },
  { name: "FileUpload", href: "/components/file-upload" },
  { name: "FileList", href: "/components/file-list" },
  { name: "ProcessingStatus", href: "/components/processing-status" },
  { name: "FlightCoverageAnalyzer", href: "/components/flight-coverage-analyzer" },
  { name: "TourBuilder", href: "/components/tour-builder" },
  { name: "Gallery", href: "/components/gallery" },
] as const;

export default function ShowcaseLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <NavStrip items={NAV_ITEMS} />
      {children}
    </>
  );
}
