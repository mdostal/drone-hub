"use client";

// Public showcase page for <VideoTour>. This repo carries no gating of any
// kind (see CLAUDE.md's "Scope boundary" section) and never has real
// property photography in it — the real Prado tour (once shot/released)
// lives entirely in the separate personal-drone platform, with its own
// access control. The only manifest this page references is the synthetic,
// locally-generated public-safe demo at
// public/showcase-samples/demo-house/tour.json.
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

<VideoTour manifest="/showcase-samples/demo-house/tour.json" />`;

export default function VideoTourShowcasePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 p-8">
      <ComponentShowcase
        title="VideoTour"
        description="Scrollytelling walkthrough that steps a floor plan through doorway-linked video clips."
        demo={
          <div className="h-[480px] w-full overflow-hidden rounded-md bg-black">
            <VideoTour manifest={withBasePath("/showcase-samples/demo-house/tour.json")} />
          </div>
        }
        code={USAGE_CODE}
      />
    </main>
  );
}
