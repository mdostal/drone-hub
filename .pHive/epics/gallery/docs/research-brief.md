# Research brief — `<Gallery>` component

## Gap confirmed

CLAUDE.md's original kickoff brief lists five plug-and-play components; the
fourth is `<Gallery>` — "plain shots carousel (shadcn carousel — trivial)."
`embla-carousel-react ^8.3.0` has been in `package.json` since project
scaffolding. No `components/Gallery/` directory, showcase page, or docs page
exists — confirmed via `find components -iname "*gallery*" -o -iname
"*carousel*"` (empty) and `grep embla-carousel package.json` (present,
unused anywhere in `components/`/`app/`).

## Pattern to match (existing shipped components)

Every shipped component follows the same four-piece shape:
- `components/<Name>/<Name>.tsx` + `<Name>.test.tsx` (+ `index.ts` barrel)
- `docs/components/<slug>.md` — spec/writeup, rendered live at
  `/docs/components/<slug>` via `app/(showcase)/docs/components/[slug]/page.tsx`'s
  hardcoded `generateStaticParams` slug array (NOT a `readdirSync` scan — see
  framework-docs-site's design-discussion for why: `docs/components/reference/`
  would throw `EISDIR`)
- `app/(showcase)/components/<slug>/page.tsx` — live demo + usage snippet,
  same shape as e.g. `voxel-terrain/page.tsx`
- an entry in the root `app/page.tsx` ToC (`TocEntry[]`)

`FileList` (`components/FileList/FileList.tsx`) is the closest sibling in
complexity: a small, prop-driven display component with no WebGL/map
dependency, so it mounts directly (no `next/dynamic({ssr:false})` needed —
that convention is reserved for heavy client-only viewers per CLAUDE.md's
stack section).

## Sample data

`public/showcase-samples/2806-prado-tour/*.jpg` (8 real, rights-cleared
interior photos — entry/kitchen/living/bedroom/bathroom/closet/hallway/
garage/patio) are already established as public-appropriate sample data in
this repo (used by `<VideoTour>`'s showcase). Reusing them for `<Gallery>`
avoids sourcing new placeholder images and keeps with this repo's
"real, not lorem-ipsum" sample-data convention.

## Scale assessment

Small. Two stories: (1) the component + tests + docs, (2) showcase page +
ToC wiring, which depends on (1). No H/V planning needed.
