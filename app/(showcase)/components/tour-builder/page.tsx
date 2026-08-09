// Public showcase page for <TourBuilder>. This whole repo carries no
// gating of any kind (see CLAUDE.md's "Scope boundary" section).
//
// No sample data to wire up — the whole point of this component is that it
// starts blank and the visitor drives it (upload a floorplan, click to
// place rooms, wire up doorways, export). Unlike every other showcase page,
// there's nothing for this page to pre-load.
import { ComponentShowcase } from "@/components/showcase";
import { TourBuilder } from "@/components/TourBuilder";

const USAGE_CODE = `import { TourBuilder } from "@/components/TourBuilder";

// Starts from a blank tour; pass initialTour to touch up an existing one.
<TourBuilder />

// The exported tour.json is the exact shape <VideoTour> consumes:
// import { VideoTour } from "@/components/VideoTour";
// <VideoTour manifest={tour} />`;

export default function TourBuilderShowcasePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 p-8">
      <ComponentShowcase
        title="TourBuilder"
        description="A visual authoring tool for <VideoTour> manifests — upload a floorplan, click to place rooms, wire up doorways, and export a real, validated tour.json instead of hand-writing one."
        demo={<TourBuilder />}
        code={USAGE_CODE}
      />
    </main>
  );
}
