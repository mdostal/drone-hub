"use client";

// Public showcase page for <VideoTour>. This repo carries no gating of any
// kind (see CLAUDE.md's "Scope boundary" section).
//
// The demo is REAL property content: 2806 Prado St's own interior
// walkthrough, released for public use by the property's owner with full
// rights, privacy-checked before use (verified directly against the
// post-flight-pipeline's privacy_flags — no people/children in any of the
// 38 candidate interior clips this sample's 9 rooms were picked from). See
// CLAUDE.md's 2026-08-09 "real, rights-cleared 2806 Prado data IS now in
// drone-hub's public samples" correction for the full authorization
// history and how this differs from the earlier incident this page's own
// regression-guard test (page.test.tsx) was originally written to prevent.
//
// public/showcase-samples/demo-house/tour.json (synthetic SVG stills, one
// real-but-generic stock spin clip) still exists in the repo, unreferenced
// by this page now — same "keep the old generic sample around, just don't
// feature it" precedent as <Model3D>'s duck/prado swap.
import dynamic from "next/dynamic";
import { ComponentShowcase } from "@/components/showcase";
import { withBasePath } from "@/lib/base-path";

// <VideoTour> is the heavy client-side viewer (video playback + room-graph
// navigation state machine) — CLAUDE.md's "every heavy viewer =
// next/dynamic({ssr:false})" convention.
const VideoTour = dynamic(
  () => import("@/components/VideoTour").then((mod) => mod.VideoTour),
  { ssr: false },
);

const USAGE_CODE = `import { VideoTour } from "@/components/VideoTour";

<VideoTour manifest="/showcase-samples/2806-prado-tour/tour.json" />`;

export default function VideoTourShowcasePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 p-8">
      <ComponentShowcase
        title="VideoTour"
        description="Scrollytelling walkthrough that steps a floor plan through doorway-linked video clips — demoed against a real property's own interior walkthrough."
        demo={
          <div className="h-[480px] w-full overflow-hidden rounded-xl bg-background">
            <VideoTour manifest={withBasePath("/showcase-samples/2806-prado-tour/tour.json")} />
          </div>
        }
        code={USAGE_CODE}
      />
    </main>
  );
}
