"use client";

// Public showcase page for <VideoTour> — this route group is deliberately
// NOT in lib/gate.ts's GATED_PATH_PREFIXES / middleware.ts's matcher, same
// as app/(showcase)/components/page.tsx.
//
// CRITICAL (see this story's yaml + CLAUDE.md's rights rules): this page
// must NEVER point at the real property tour manifest under public/tours/
// (gated, served via /tours/[slug]) — that is REAL, currently-gated
// photography of the operator's actual property. The only manifest this
// page may reference is the synthetic, locally-generated public-safe demo
// at public/showcase-samples/demo-house/tour.json.
import dynamic from "next/dynamic";
import { ComponentShowcase } from "@/components/showcase";

// <VideoTour> is the heavy client-side viewer (video playback + room-graph
// navigation state machine) — CLAUDE.md's "every heavy viewer =
// next/dynamic({ssr:false})" convention, same as app/tours/[slug]/page.tsx.
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
            <VideoTour manifest="/showcase-samples/demo-house/tour.json" />
          </div>
        }
        code={USAGE_CODE}
      />
    </main>
  );
}
