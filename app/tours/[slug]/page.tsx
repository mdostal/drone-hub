"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { withBasePath } from "@/lib/base-path";

// <VideoTour> is the heavy client-side viewer (video playback + room-graph
// navigation state machine) — CLAUDE.md's "every heavy viewer =
// next/dynamic({ssr:false})" convention applies here.
//
// This page is itself a Client Component (rather than a Server Component
// reading the `params` prop directly) specifically so that `ssr: false` is
// legal to pass to next/dynamic: Next's App Router rejects `ssr: false` on
// next/dynamic when it's called from a Server Component.
const VideoTour = dynamic(
  () => import("@/components/VideoTour").then((mod) => mod.VideoTour),
  { ssr: false },
);

// Gating for the whole /tours/* tree (this route + the manifest/asset fetch
// below) is enforced server-side by middleware.ts before this page is ever
// reached — see middleware.ts's matcher: ["/tours/:path*"]. This component
// intentionally contains zero passcode/session logic of its own; it just
// resolves `slug` and hands VideoTour a manifest URL.
export default function TourPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  return (
    <main className="h-screen w-screen bg-black">
      <VideoTour manifest={withBasePath(`/tours/${slug}/tour.json`)} />
    </main>
  );
}
