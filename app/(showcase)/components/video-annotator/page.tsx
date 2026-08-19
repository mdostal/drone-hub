"use client";

// Public showcase page for <VideoAnnotator>. This repo carries no gating of
// any kind (see CLAUDE.md's "Scope boundary" section).
//
// The demo is REAL property content: 2806 Prado St's own interior
// walkthrough clip (entry.mp4), released for public use by the property's
// owner with full rights, privacy-checked before use (verified directly
// against the post-flight-pipeline's privacy_flags — no people/children in
// any of the 38 candidate interior clips this sample set was picked from).
// See CLAUDE.md's 2026-08-09 "real, rights-cleared 2806 Prado data IS now in
// drone-hub's public samples" correction for the full authorization history.
// Same sample family <VideoTour>'s showcase page already uses
// (public/showcase-samples/2806-prado-tour/) — entry.mp4 was picked over the
// other room clips for enough visual content (doorway, floor, wall detail)
// to make the zoom/draw demo meaningful.
import dynamic from "next/dynamic";
import { ComponentShowcase } from "@/components/showcase";
import { withBasePath } from "@/lib/base-path";

// <VideoAnnotator> is a heavy client-side viewer (video playback + canvas
// drawing state) — CLAUDE.md's "every heavy viewer = next/dynamic({ssr:false})"
// convention, same as <VideoTour>/<LayerViewer>/<Model3D>'s showcase pages.
const VideoAnnotator = dynamic(
  () => import("@/components/VideoAnnotator").then((mod) => mod.VideoAnnotator),
  { ssr: false },
);

const USAGE_CODE = `import { VideoAnnotator } from "@/components/VideoAnnotator";

<VideoAnnotator
  src="/showcase-samples/2806-prado-tour/entry.mp4"
  onAnnotationsChange={(shapes) => console.log(shapes)}
/>`;

export default function VideoAnnotatorShowcasePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 p-8">
      <ComponentShowcase
        title="VideoAnnotator"
        description="Scrub, zoom, and draw shapes/points/labels over a clip, then export the current frame + annotations as a PNG — demoed against a real property's own interior walkthrough clip."
        demo={
          <div className="h-[480px] w-full overflow-hidden rounded-xl bg-background">
            <VideoAnnotator src={withBasePath("/showcase-samples/2806-prado-tour/entry.mp4")} />
          </div>
        }
        code={USAGE_CODE}
      />
    </main>
  );
}
