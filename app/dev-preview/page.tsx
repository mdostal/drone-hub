import { VideoTour } from "@/components/VideoTour";

// TEMPORARY dev-only verification route for video-tour-core-components.
// Not part of any story's acceptance criteria — exists so <VideoTour> can be
// manually exercised against the real Prado manifest during development.
// A later story may replace or remove this once there's a real /tours/*
// surface that mounts VideoTour for real. Safe to delete at any time.
//
// Note: /tours/2806-prado/tour.json is gated by middleware.ts (matcher
// /tours/:path*), so the client-side fetch below only succeeds once the
// dronehub_tour_gate cookie is set — visit /enter-passcode first (with
// DRONE_HUB_PASSCODE set in .env.local) to unlock it.
export default function DevPreviewPage() {
  return (
    <main className="h-screen w-screen bg-black">
      <VideoTour manifest="/tours/2806-prado/tour.json" />
    </main>
  );
}
