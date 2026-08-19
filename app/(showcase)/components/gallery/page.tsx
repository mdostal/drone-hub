"use client";

// Public showcase page for <Gallery>. This whole repo carries no gating of
// any kind (see CLAUDE.md's "Scope boundary" section).
//
// The demo is fed by the real 2806 Prado St interior stills already
// established as public-appropriate sample data by <VideoTour>'s own
// showcase page (app/(showcase)/components/video-tour/page.tsx) — released
// for public use by the property's owner, privacy-checked before use. See
// CLAUDE.md's 2026-08-09 "real, rights-cleared 2806 Prado data IS now in
// drone-hub's public samples" correction for the full authorization
// history. No new asset here, just a different component (a plain shots
// carousel) reusing the same already-cleared public/showcase-samples/
// 2806-prado-tour/*.jpg stills that <VideoTour> uses as room posters.
//
// <Gallery> needs no next/dynamic({ssr:false}) wrapping — see
// components/Gallery/Gallery.tsx's header comment (it touches no WebGL/map
// API at module scope) — so this mounts it directly, same as
// app/(showcase)/components/file-list/page.tsx.
import { ComponentShowcase } from "@/components/showcase";
import { Gallery } from "@/components/Gallery";
import type { GalleryImage } from "@/components/Gallery";
import { withBasePath } from "@/lib/base-path";

const SAMPLE_IMAGES: GalleryImage[] = [
  { src: withBasePath("/showcase-samples/2806-prado-tour/entry.jpg"), alt: "Entry", caption: "Entry" },
  { src: withBasePath("/showcase-samples/2806-prado-tour/kitchen.jpg"), alt: "Kitchen", caption: "Kitchen" },
  { src: withBasePath("/showcase-samples/2806-prado-tour/living.jpg"), alt: "Living room", caption: "Living room" },
  { src: withBasePath("/showcase-samples/2806-prado-tour/bedroom.jpg"), alt: "Bedroom", caption: "Bedroom" },
  { src: withBasePath("/showcase-samples/2806-prado-tour/bathroom.jpg"), alt: "Bathroom", caption: "Bathroom" },
  { src: withBasePath("/showcase-samples/2806-prado-tour/closet.jpg"), alt: "Closet", caption: "Closet" },
  { src: withBasePath("/showcase-samples/2806-prado-tour/hallway.jpg"), alt: "Hallway", caption: "Hallway" },
  { src: withBasePath("/showcase-samples/2806-prado-tour/garage.jpg"), alt: "Garage", caption: "Garage" },
  { src: withBasePath("/showcase-samples/2806-prado-tour/patio.jpg"), alt: "Patio", caption: "Patio" },
];

const USAGE_CODE = `import { Gallery } from "@/components/Gallery";
import type { GalleryImage } from "@/components/Gallery";

const images: GalleryImage[] = [
  { src: "/gallery-samples/front.jpg", alt: "Front elevation" },
  { src: "/gallery-samples/back.jpg", alt: "Back yard", caption: "Back yard, dusk" },
];

<Gallery images={images} className="h-full w-full" />`;

export default function GalleryShowcasePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 p-8">
      <ComponentShowcase
        title="Gallery"
        description="Plain shots carousel — prev/next, arrow-key nav, and dot indicators over a fixed image list. Demoed against 2806 Prado St's own interior stills."
        demo={<Gallery images={SAMPLE_IMAGES} />}
        code={USAGE_CODE}
      />
    </main>
  );
}
