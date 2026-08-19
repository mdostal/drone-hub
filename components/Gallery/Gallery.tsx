"use client";

import { useCallback, useEffect, useState } from "react";
import type { KeyboardEvent } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * <Gallery> — a thin, deliberately trivial wrapper around embla-carousel-react.
 * See docs/components/gallery.md and .pHive/epics/gallery/docs/design-discussion.md.
 *
 * DELIBERATELY MINIMAL PROPS (matches this repo's established "deliberately
 * narrow prop surface" convention — see components/Model3D/Model3D.tsx's
 * `ModelDef` do-not-list comment for the same rationale pattern applied to a
 * different component). `images` / `className` / `loop` is the whole prop
 * surface, and it stays that way: no lightbox, no zoom, no lazy-loading — a
 * "plain shots carousel" per CLAUDE.md's own Phase-1 framing, on purpose.
 * If a future epic needs those, that's a new component or a deliberate,
 * separately-reviewed prop addition — not a silent expansion here.
 *
 * Portable: everything this folder needs is `embla-carousel-react` (an
 * ordinary npm dep, no Next.js/app-router coupling) + `lucide-react`. No
 * `next/image` (keeps this copy-portable into a standalone consumer like
 * personal-site, same precedent as `<VideoTour>`'s room stills using a
 * plain `<img>`), no fetch, no storage/auth of any kind.
 */
export interface GalleryImage {
  src: string;
  alt: string;
  caption?: string;
}

export interface GalleryProps {
  images: GalleryImage[];
  className?: string;
  /** Wrap around at the ends. Default true. When false, the prev/next
   *  buttons disable at the first/last slide instead of wrapping. */
  loop?: boolean;
}

export function Gallery({ images, className, loop = true }: GalleryProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
    setCanScrollPrev(emblaApi.canScrollPrev());
    setCanScrollNext(emblaApi.canScrollNext());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi, onSelect]);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);
  const scrollTo = useCallback((index: number) => emblaApi?.scrollTo(index), [emblaApi]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        scrollPrev();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        scrollNext();
      }
    },
    [scrollPrev, scrollNext],
  );

  if (images.length === 0) {
    return <p className={["text-sm text-muted", className].filter(Boolean).join(" ")}>No images.</p>;
  }

  return (
    <div
      className={["flex flex-col gap-3", className].filter(Boolean).join(" ")}
      role="region"
      aria-roledescription="carousel"
      aria-label="Image gallery"
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <div className="relative">
        <div className="overflow-hidden rounded-xl border border-border bg-surface" ref={emblaRef}>
          <div className="flex">
            {images.map((image, index) => (
              <div
                key={`${index}-${image.src}`}
                className="relative min-w-0 flex-[0_0_100%]"
                role="group"
                aria-roledescription="slide"
                aria-label={`Slide ${index + 1} of ${images.length}`}
              >
                <img src={image.src} alt={image.alt} className="aspect-video w-full object-cover" />
                {image.caption ? <p className="p-2 text-sm text-muted">{image.caption}</p> : null}
              </div>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={scrollPrev}
          disabled={!canScrollPrev}
          aria-label="Previous image"
          className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full border border-border bg-surface/80 p-2 text-foreground transition-colors hover:border-accent/70 disabled:opacity-40"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={scrollNext}
          disabled={!canScrollNext}
          aria-label="Next image"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full border border-border bg-surface/80 p-2 text-foreground transition-colors hover:border-accent/70 disabled:opacity-40"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="flex justify-center gap-2">
        {images.map((image, index) => (
          <button
            key={`${index}-${image.src}`}
            type="button"
            onClick={() => scrollTo(index)}
            aria-label={`Go to slide ${index + 1}`}
            aria-current={index === selectedIndex}
            className={[
              "h-2 w-2 rounded-full transition-colors",
              index === selectedIndex ? "bg-accent" : "bg-border",
            ].join(" ")}
          />
        ))}
      </div>
    </div>
  );
}
