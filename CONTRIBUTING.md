# Contributing

Thanks for taking a look at `@dostal/framework`. This is a small, single-maintainer
open-source project — contributions are welcome, but keep expectations calibrated to
that (no formal RFC process, no SLA on review turnaround).

## Getting set up

```
npm install
npm run dev
```

Then browse the running app — the root `/` page lists every component with its live
demo and doc page.

## Before opening a PR

There's no CI wired up yet, so these are manual pre-push checks:

```
npm test        # Vitest + React Testing Library (jsdom) — must pass
npm run build   # next build — must complete clean, including typecheck + lint
npm run test:e2e  # Playwright — only for changes touching lib/*.placement.test.ts's
                   # real-WebGL geo-placement math
```

## Where things live

- `components/<Name>/` — one directory per component (the component itself + its
  tests). Each shipped component also has a docs page at `docs/components/<slug>.md`,
  rendered live at `/docs/components/<slug>`, and a showcase demo under
  `app/(showcase)/components/<slug>/`.
- `lib/` — shared, framework-agnostic logic (geo math, manifest resolution, etc.)
  pulled out of components specifically so it's unit-testable without a WebGL/DOM
  context.
- `pipeline/` — standalone, non-bundled scripts (GDAL/PDAL/ODM-adjacent processing).
  Never imported from `app/`, `components/`, or `lib/`.
- `public/*-samples/` — sample data each component's showcase demo runs against.
  Most of it is synthetic/placeholder; a few components ship real, rights-cleared
  sample data instead (see the README's note on this) — don't assume everything
  under `public/` is fair-use placeholder before checking a given directory's own
  provenance comments.

## Component conventions

- Deliberately narrow prop surfaces — see each component's own doc comments for the
  "do not add X" rationale before proposing a new prop; several were scoped down on
  purpose during design review.
- Heavy client-only viewers (WebGL canvases, map libraries) are always mounted via
  `next/dynamic(() => import(...), { ssr: false })`.
- No secrets, API keys, or real third-party PII in any commit — this repo is public
  and stays that way.

## License

MIT — see `LICENSE`. By contributing, you agree your contribution is licensed under
the same terms.
