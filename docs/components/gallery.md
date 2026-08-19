# `<Gallery>` — plain shots carousel (hive spec)

> A trivial, embla-backed image carousel — the last unbuilt component from CLAUDE.md's
> original Phase-1 MVP list. Prev/next buttons, left/right arrow-key navigation, and dot
> indicators over a fixed `{src, alt, caption?}` image list. Plug-and-play, importable into
> any app, publicly showcased at `/components/gallery`.

**Design discussion (RESOLVED architecture — read first):**
`.pHive/epics/gallery/docs/design-discussion.md` — this doc documents that decision, it
does not re-derive it.

## Why (operator intent — honor this)

CLAUDE.md's original Phase-1 MVP list named five components; four shipped first
(`<LayerViewer>`, `<VideoAnnotator>`/`<VideoTour>`, plus the Phase-2/3 work that followed).
`<Gallery>` is the fifth and last of that original list — CLAUDE.md's own framing calls it
out explicitly as "plain shots carousel (shadcn carousel — trivial)." `embla-carousel-react`
(`^8.3.0`) has been sitting in `package.json` as an installed-but-unused dependency since
project scaffolding specifically for this component; this story is what finally uses it.

## The props — deliberately minimal

```ts
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
```

**DELIBERATELY MINIMAL PROPS** — same "deliberately narrow prop surface" convention this
repo already established for `<Model3D>`'s `ModelDef` (see `components/Model3D/Model3D.tsx`'s
do-not-list doc comment for the same rationale pattern, applied here to a different
component): `images` / `className` / `loop` is the *whole* prop surface, on purpose. No
lightbox, no zoom, no lazy-loading — CLAUDE.md calls this a "trivial" carousel, and the
acceptance criteria for this story bound the prop surface explicitly so it stays that way.
If a future epic needs a lightbox or zoom, that's either a new component or a deliberate,
separately-reviewed prop addition — not a silent expansion of this one.

## Behavior

1. **One slide per image**, rendered full-width inside an embla viewport/container pair
   (`ref={emblaRef}` on the viewport div, a `flex` row container, one `flex-[0_0_100%]`
   slide div per image — the standard embla-carousel-react DOM shape). Each slide is
   `role="group"` / `aria-roledescription="slide"` / `aria-label="Slide N of TOTAL"`,
   following the W3C carousel authoring-practice pattern; the whole component is
   `role="region"` / `aria-roledescription="carousel"` / `aria-label="Image gallery"`.
2. **Prev/next buttons** (`lucide-react`'s `ChevronLeft`/`ChevronRight`), positioned
   absolutely over the image area, call `emblaApi.scrollPrev()` / `scrollNext()`. Their
   `disabled` state is driven directly off embla's own `canScrollPrev()`/`canScrollNext()`
   — see "Loop behavior" below for what that means at the boundaries.
3. **Keyboard navigation.** The carousel region is focusable (`tabIndex={0}`) and listens
   for `ArrowLeft`/`ArrowRight` `onKeyDown`, calling the same `scrollPrev`/`scrollNext` the
   buttons call (`event.preventDefault()` so arrow keys don't also scroll the page).
4. **Dot indicators**, one per image, below the image area. The active dot
   (`aria-current="true"`, filled with `bg-accent`) tracks embla's `selectedScrollSnap()`
   via its `"select"`/`"reInit"` events; clicking a dot calls `emblaApi.scrollTo(index)` to
   jump directly to that slide.
5. **Caption**, if `caption` is present on that image, renders under the image inside the
   same slide.
6. **Empty state.** Given `images={[]}`, it renders `"No images."` rather than an empty
   carousel shell (same empty-state convention as `<FileList>`'s `"No files."`).

## Loop behavior

`loop` (default `true`) is forwarded straight to `useEmblaCarousel({ loop })` — embla's own
loop semantics, not hand-rolled wrap-around logic:

- **`loop=true` (default):** `canScrollPrev()`/`canScrollNext()` are always `true` once
  there's more than one slide — clicking `next` past the last slide wraps to the first, and
  vice versa. Neither button is ever disabled.
- **`loop=false`:** `canScrollPrev()` is `false` at the first slide, `canScrollNext()` is
  `false` at the last slide — the corresponding button disables (native `disabled`
  attribute) instead of wrapping.

## What this component deliberately does NOT do

- **No lightbox / full-screen zoom view** — clicking or tapping an image does nothing
  beyond whatever the caller's own page chrome provides.
- **No pinch/scroll zoom on the image itself.**
- **No lazy-loading / virtualization** of off-screen images — `images` is expected to be a
  reasonably small, already-resolved list (a property's shot gallery, not an infinite feed).
- **No autoplay** — navigation is always the visitor's own action (click, arrow key, or dot).
- **No fetch of an image manifest from anywhere** — same "the array is the whole input"
  convention as `<FileList>`'s `files` prop; the caller is responsible for however it
  obtained the `GalleryImage[]`.

## Usage

```tsx
import { Gallery } from "@/components/Gallery";
import type { GalleryImage } from "@/components/Gallery";

const images: GalleryImage[] = [
  { src: "/gallery-samples/front.jpg", alt: "Front elevation" },
  { src: "/gallery-samples/back.jpg", alt: "Back yard", caption: "Back yard, dusk" },
  { src: "/gallery-samples/kitchen.jpg", alt: "Kitchen" },
];

<Gallery images={images} className="h-full w-full" />

// Non-looping variant — prev/next disable at the boundaries instead of wrapping:
<Gallery images={images} loop={false} />
```

No `next/dynamic({ ssr: false })` wrapping is needed — unlike `<LayerViewer>`/`<Model3D>`/
`<VoxelTerrain>`, `<Gallery>` touches no WebGL/map API at module scope (`embla-carousel-react`
only touches the DOM once mounted, same as any ordinary React component), so it mounts
directly like `<FileList>`.

Copy-portable into a standalone consumer like personal-site — everything this component
needs is `embla-carousel-react` + `lucide-react`, no `app/` or gating dependency, same
precedent as `components/FileList/index.ts` and `components/Model3D/index.ts`.

## Acceptance criteria

- [x] Given an array of 3+ images, when `<Gallery>` mounts, then all images render as
      carousel slides with prev/next navigation working via click and left/right arrow keys.
  Verified: `Gallery.test.tsx`'s render/click-nav/keyboard-nav specs.
- [x] Given `loop` is omitted, when the carousel reaches the last slide and next is
      clicked, then it wraps to the first slide (default `true`).
  Verified: `Gallery.test.tsx`'s loop-wrap spec, plus asserting the next button is never
  disabled while looping.
- [x] Given `loop={false}`, when the carousel reaches the last slide, then the next button
      is disabled rather than wrapping.
  Verified: `Gallery.test.tsx`'s no-loop spec, both directions (next at the last slide, prev
  at the first slide).
- [x] Given the dot indicators, then they show the correct active-slide state and clicking
      a dot navigates directly to that slide.
  Verified: `Gallery.test.tsx`'s dot-indicator spec.
- [x] Given `npm test`, when run after this story, then it passes with the new Gallery
      tests included.

## Phase fit

- **This story (`gallery` epic, `gallery-component-and-docs`):** `<Gallery>` + its tests +
  this doc.
- **Next (`gallery-showcase-integration`, same epic):** the public showcase page at
  `/components/gallery`, fed by the real `public/showcase-samples/2806-prado-tour/*.jpg`
  photos already established as public-appropriate sample data (used by `<VideoTour>`'s own
  showcase), plus the component-framework docs-site ToC entry and `generateStaticParams`
  slug wiring. Not this story's scope.
- **Deliberately out of scope, permanently:** lightbox/zoom/lazy-load — see "What this
  component deliberately does NOT do" above; this is CLAUDE.md's own "trivial" framing for
  `<Gallery>`, not a phase-deferred feature.
