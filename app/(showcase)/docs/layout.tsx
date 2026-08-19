import type { ReactNode } from "react";
import { DocsSidebar } from "@/components/showcase";
import type { DocsSidebarSection } from "@/components/showcase";

// Shared layout for the `/docs/*` route group — the real, sidebar-driven
// "shadcn-style docs site" the operator asked for on 2026-08-10 ("very
// shad-cn like... not just these little cards of them, like something nice
// that talks about it, explains it, has an about page"). Nests INSIDE the
// parent app/(showcase)/layout.tsx, so `/docs/*` pages get both the
// horizontal <NavStrip> (unchanged, still useful for jumping straight to a
// live demo) AND this persistent left sidebar (Introduction + every
// component's writeup) — the two are complementary, not duplicates: NavStrip
// jumps to a LIVE DEMO, this sidebar navigates the DOCS.
//
// Deliberately a plain, synchronous Server Component — no cookies(),
// headers(), or searchParams — for the exact same reason
// app/(showcase)/layout.tsx's own header comment gives:
// app/(showcase)/docs/components/[slug]/page.tsx is fully statically
// prerendered today (generateStaticParams) and any dynamic API here would
// force it back to dynamic (ƒ) rendering. Active-route highlighting needs
// usePathname(), which needs a client boundary — isolated entirely inside
// components/showcase/DocsSidebar.tsx ("use client"), not here.
//
// Mirrors app/(showcase)/layout.tsx's own NAV_ITEMS list content (hand-
// mirrored, not imported — same "small, low-churn" precedent that file's
// own header comment documents) plus the new Introduction entry.
const DOCS_SECTIONS: DocsSidebarSection[] = [
  {
    title: "Get Started",
    items: [{ name: "Introduction", href: "/docs" }],
  },
  {
    title: "Components",
    items: [
      { name: "VideoTour", href: "/docs/components/video-tour" },
      { name: "VideoAnnotator", href: "/docs/components/video-annotator" },
      { name: "LayerViewer", href: "/docs/components/layer-viewer" },
      { name: "Model3D", href: "/docs/components/model3d" },
      { name: "LandOverlay", href: "/docs/components/land-overlay" },
      { name: "VoxelTerrain", href: "/docs/components/voxel-terrain" },
      { name: "ContentEngine", href: "/docs/components/content-engine" },
      { name: "MinecraftExport", href: "/docs/components/minecraft-export" },
      { name: "FileUpload", href: "/docs/components/file-upload" },
      { name: "FileList", href: "/docs/components/file-list" },
      { name: "ProcessingStatus", href: "/docs/components/processing-status" },
      { name: "FlightCoverageAnalyzer", href: "/docs/components/flight-coverage-analyzer" },
      { name: "TourBuilder", href: "/docs/components/tour-builder" },
      { name: "Gallery", href: "/docs/components/gallery" },
    ],
  },
];

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 p-8 sm:flex-row sm:gap-12">
      <DocsSidebar sections={DOCS_SECTIONS} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
