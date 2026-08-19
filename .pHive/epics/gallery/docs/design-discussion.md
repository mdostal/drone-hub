# Design discussion — `<Gallery>` component

## Goal

Ship the `<Gallery>` component from CLAUDE.md's original Phase-1 MVP list —
a plain shots carousel, embla-backed, plug-and-play. The last unbuilt
component from the original five-component kickoff scope.

## Proposed approach

- `components/Gallery/Gallery.tsx`: a thin wrapper around
  `embla-carousel-react`. Props: `images: GalleryImage[]` (`{src, alt,
  caption?}`), optional `className`, optional `loop` (default true).
  Deliberately narrow — matches this repo's established "deliberately
  minimal props" convention (see `Model3D.tsx`'s own do-not-list doc
  comment) — no lazy-load/lightbox/zoom scope creep for a "trivial"
  component.
- Keyboard-navigable (arrow keys) + visible prev/next buttons + dot
  indicators, styled with this repo's existing design tokens
  (`bg-surface`/`border-border`/`text-accent` from `app/globals.css`,
  matching every other component's showcase chrome).
- `docs/components/gallery.md` written to the same template as the other
  seven `docs/components/*.md` files.
- Showcase page at `app/(showcase)/components/gallery/page.tsx`, live demo
  fed by the 8 real `public/showcase-samples/2806-prado-tour/*.jpg` photos,
  usage snippet block matching the `<CopyButton>` pattern every other
  showcase page uses.
- Add the 8th ToC entry to `app/page.tsx`'s `TocEntry[]` array and bump the
  page header count if it's hardcoded anywhere (grep before assuming).
- `generateStaticParams` in `app/(showcase)/docs/components/[slug]/page.tsx`
  gets `"gallery"` added to its hardcoded slug array (NOT a readdirSync
  scan — established constraint from framework-docs-site's own
  design-discussion, still applies).

## Risks

- Low. This is additive-only: a new component + new routes + one array
  entry in an existing file. No existing component's behavior changes.
- The one real risk: forgetting to add `"gallery"` to the hardcoded
  `generateStaticParams` slug array (silent 404 on `/docs/components/gallery`
  at build time, not caught by `npm run dev`). Acceptance criteria below
  requires a real `npm run build` check for this exact reason.

## Open questions

None — scope is fully bounded by the existing 4-piece component pattern.

## Scale assessment

**Small** — proceeding directly to stories, no H/V planning.
