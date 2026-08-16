---
name: add-component
description: Install a drone-hub (@dostal/framework) component into an external Next.js app by copying its real files — component, lib/*-types.ts, and public/*-samples/ sample data — and diffing its actual imports against the target app's package.json, shadcn-CLI-style (there is no npm package; this is a copy, not `npm install`). Also scaffolds a brand-new component in THIS repo matching its existing conventions: component file + docs/components/<slug>.md stub + showcase page, and identifies (without silently editing) the three places a new component needs wiring into the showcase site. Use when asked to "add", "install", "copy", "vendor", or "pull in" a drone-hub component into another project, or to "scaffold"/"create a new component" in drone-hub itself.
---

# add-component

Two modes, one shared discipline: **derive the real file set and real usage
snippet from what's actually on disk, never from a hardcoded per-component
table.** Components in this repo diverge more than they look alike at a
glance — see "What the research found" below before assuming a uniform
template. If any step below can't find what it's looking for, stop and say
so rather than guessing a path.

## Install mode — copy a component into another app

**This is a copy operation, not an npm install.** drone-hub is
`@dostal/framework`, a shadcn-style component library — no package is
published to a registry. CLAUDE.md's stack decision is explicit: **"BUILD &
own the viewer... NEVER embed the SaaS."** Installing a component here means
the same thing it means for shadcn/ui: copy the source into the consuming
app, then that app owns and can freely edit its own copy.

Given a component slug (e.g. `layer-viewer`, `voxel-terrain`) and a target
app path:

### 1. Resolve the slug to its real files

Slugs are the kebab-case names used in `docs/components/<slug>.md` and
`app/(showcase)/components/<slug>/`. Most slugs map to one PascalCase folder
under `components/` (`layer-viewer` → `components/LayerViewer/`,
`voxel-terrain` → `components/VoxelTerrain/`, `file-upload` →
`components/FileUpload/`). **Not all of them do** — `land-overlay` and
`minecraft-export` have their own `docs/components/*.md` page and showcase
route but are *not* their own `components/` folder:

- `land-overlay` is `<LayerViewer>`'s `models` prop, backed by
  `lib/geo-model-types.ts` + `lib/maplibre-model-layer.ts` — installing it
  means installing `LayerViewer` plus those two `lib/` files.
- `minecraft-export` is a download feature built from
  `lib/minecraft-schematic.ts` + `lib/minecraft-block-palette.ts` +
  `app/api/minecraft-export/route.ts`, layered onto `<VoxelTerrain>`'s data
  — it's a server route, not a portable component; say so rather than
  copying a `components/` folder that doesn't exist.

Check `components/<PascalCase>/` first; if it isn't there, read
`app/(showcase)/components/<slug>/page.tsx`'s imports to find what it's
actually built from, and report that composite shape to the user instead of
forcing it into the "one component folder" template.

### 2. Read the component's real usage snippet

The most reliable source is the **`USAGE_CODE` constant inside
`app/(showcase)/components/<slug>/page.tsx`** — every one of the 10 showcase
pages defines one, and it's live code the page actually renders (so it
can't drift silently the way a hand-maintained doc snippet can). Cross-check
against `docs/components/<slug>.md`'s own `## Usage` section when one exists
— as of this writing only `content-engine.md`, `land-overlay.md`,
`minecraft-export.md`, and `voxel-terrain.md` have one; most docs pages
don't, so don't treat its absence as an error. Prefer `USAGE_CODE` when the
two would ever disagree.

### 3. Enumerate the real file set from disk

Do not hardcode a per-component list — read it fresh each time:

- **Component files**: every non-test file directly under
  `components/<PascalCase>/` (e.g. `Foo.tsx`, `index.ts`, and, when
  present, a component-local `cx.ts` and any co-located helper module like
  `components/FileList/file-list-utils.ts`). `*.test.ts(x)` files are
  excluded by default — a target app's own test setup may not match this
  repo's Vitest config; mention they exist and offer to include them if the
  user wants the coverage too. Note that `cx.ts` (a tiny classname-join
  helper) is *intentionally duplicated per component folder* in this repo
  rather than shared from a common `lib/utils.ts` — copy each component's
  own copy, don't try to dedupe it against another component's `cx.ts`.
- **Type/logic files under `lib/`**: grep the copied component files (and
  anything they import) for `from "@/lib/..."` and copy every file that
  resolves to. This is **not always just a `-types.ts` file**: some
  components have none at all (`Model3D`, `FileUpload` define their props
  inline, no `lib/` dependency), some have exactly one
  (`lib/voxel-types.ts` for VoxelTerrain, `lib/tour-types.ts` for
  VideoTour, `lib/file-types.ts` for FileList), and at least one has a
  types file *and* a separate logic module
  (`FlightCoverageAnalyzer` needs both `lib/flight-coverage-types.ts` and
  `lib/flight-coverage.ts`).
- **Sample data**: grep the showcase page (and its companion `*Demo.tsx`
  file, if the component uses one) for `@/public/...` static imports and
  `"/..."` manifest path strings passed as props. **The sample folder name
  does not reliably follow `<slug>-samples/`** — it's named per the epic
  that produced it, not the component: VoxelTerrain's sample lives under
  `public/minecraft-samples/2806-prado/`, VideoTour's showcase sample lives
  under `public/showcase-samples/demo-house/`, FlightCoverageAnalyzer's
  under `public/flight-coverage-samples/2806-prado-flight2/`, while
  LayerViewer's and Model3D's do follow the `<slug>-samples/` pattern
  (`public/layer-viewer-samples/2806-prado/`,
  `public/model3d-samples/prado/`). Always confirm the actual path from the
  import/prop, never construct it from the slug. Copy the whole referenced
  per-property folder, again excluding `*.test.ts` fixture files by
  default.

### 4. Copy into the target app

Mirror the source structure at the target app's root:

- `components/<PascalCase>/*` → `<target>/components/<PascalCase>/*`
- each resolved `lib/<file>.ts` → `<target>/lib/<file>.ts`
- each resolved sample folder → `<target>/public/<same-relative-path>/`

State plainly in your summary to the user that these are now the target
app's own files, free to edit — this is a one-time copy, no ongoing link
back to drone-hub.

### 5. Diff dependencies against the target app's `package.json`

Collect every bare (non-relative, non-`@/`) import specifier across all
copied files, drop `react`/`react-dom`/`next` (assume present in any Next.js
app), and compare what's left against the target's
`dependencies`/`devDependencies`. For anything missing, report it **with the
version pinned in drone-hub's own `package.json`** (e.g.
`@react-three/fiber@^9.7.0`, `@react-three/drei@^10.7.8`,
`maplibre-gl@^4.7.0`, `three@^0.169.0`) and tell the user to install it
themselves — **do not run `npm install` on their behalf**, this skill only
copies files and reports gaps. Note when a flagged package has its own peer
dependency worth calling out (e.g. `@react-three/fiber` peer-depends on
`three` — if the copied files don't import `three` directly, the diff won't
catch it, but the target app's own `npm install` will surface the peer
warning).

### 6. Report

Summarize: files copied (component + lib + sample data), any missing
dependencies with versions, and anything skipped (tests, unresolvable
imports) so the user knows exactly what did and didn't come along.

## Scaffold mode — create a new component matching this repo's conventions

Given a new component name (e.g. "TestWidget" → slug `test-widget`):

### 1. Component folder — `components/<Name>/`

- `<Name>.tsx` — `"use client"` if it's interactive or touches a browser-only
  API (state, refs, DOM/canvas/WebGL/video); a purely presentational
  server-renderable component can skip it. Export a `<Name>Props` interface
  and the component function.
- `cx.ts` — copy the same 8-line classname-join helper every existing
  component folder carries verbatim (see any existing `components/*/cx.ts`)
  — this repo deliberately duplicates it per folder rather than sharing a
  `lib/utils.ts`, so a fresh component should match that, not "fix" it.
- `index.ts` — re-export the component and its prop type only; keep
  internal helpers un-exported (the established pattern —
  `VoxelInstances`/`toErrorMessage`-style internals stay private).
- Only add a `lib/<slug>-types.ts` if the new component needs a data shape
  shared with other code (a manifest, a registry) — plenty of real
  components (`Model3D`, `FileUpload`) have none; don't manufacture one
  just to match a perceived pattern.
- Only add `public/<slug>-samples/<slug>/` if the component needs sample
  data to demo. `<slug>-samples/` is a reasonable **default** name for a
  brand-new component's sample folder — existing components that diverge
  from it (`minecraft-samples`, `showcase-samples`) do so because they
  predate or were named after the epic that produced them, not because the
  convention itself is different.

### 2. Docs stub — `docs/components/<slug>.md`

Match the structure observed across existing docs pages: title line
`` # `<Name>` — one-line summary (hive spec) ``, a blockquote summary
mentioning it's plug-and-play and where it's showcased, `## Why (operator
intent — honor this)`, a `## The contract` (or similarly-named) code block
with the props interface, `## Behavior`, `## Tech` (npm deps + any `lib/`
type dependency), `## Usage` with the exact import + JSX the showcase page
will render, and `## Phase fit`. This `## Usage` block **must match** the
showcase page's `USAGE_CODE` exactly — that's the pairing install mode's
step 2 (above) relies on.

### 3. Showcase page — `app/(showcase)/components/<slug>/page.tsx`

Wrap the live demo in `<ComponentShowcase>` (`@/components/showcase`),
passing `title`, `description`, `demo`, and a `USAGE_CODE` string as `code`.
**If the component is a heavy client-only viewer** (WebGL/three.js,
MapLibre, `<video>`/HLS) — the same class of thing CLAUDE.md's "every heavy
viewer = `next/dynamic({ssr:false})`" convention targets — split the demo
into its own `<Name>Demo.tsx` client component and mount it via
`dynamic(() => import("./<Name>Demo"), { ssr: false })`, mirroring
`app/(showcase)/components/voxel-terrain/page.tsx` +
`VoxelTerrainDemo.tsx`. A plain presentational component (no canvas/video)
can render directly inside `page.tsx` with no dynamic import, same as
`file-upload`'s showcase page.

### 4. Identify — don't silently apply — the three showcase-wiring edits

Report these to the user as follow-ups rather than editing them yourself
unless asked, since each is a shared file every other component also has an
entry in:

1. **`app/(showcase)/layout.tsx`**'s `NAV_ITEMS` array — add
   `{ name: "<Name>", href: "/components/<slug>" }`.
2. **`app/page.tsx`**'s `TOC` array — add the richer entry (title,
   description, `demoHref: "/components/<slug>"`,
   `docHref: "/docs/components/<slug>"`).
3. **`app/(showcase)/docs/components/[slug]/page.tsx`**'s hardcoded
   `KNOWN_SLUGS` array — add `"<slug>"`. This route deliberately never
   `fs.readdirSync`s `docs/components/` (see `.pHive/CONTEXT.md`'s
   "Rendering a static prose doc" entry — an unfiltered scan would hit the
   non-file `docs/components/reference/` entry and throw at build time), so
   a new doc page is invisible until its slug is added here.

## What the research found (why this skill reads from disk instead of a table)

Surveyed all 12 shipped `docs/components/*.md` pages and the component
folders behind them. The loose pattern — component file(s) + optional
`lib/*-types.ts` + optional `public/*-samples/<slug>/` + `docs/components/
<slug>.md` — mostly holds, but every optional piece really is optional in
practice, and naming is not uniform:

- Two docs pages (`land-overlay`, `minecraft-export`) don't correspond to a
  `components/` folder at all — they're features layered onto other
  components' code plus `lib/`/`app/api/` files.
- `lib/*-types.ts` dependency is absent for `Model3D` and `FileUpload`,
  singular for most, and split into a types file *and* a logic file for
  `FlightCoverageAnalyzer` (`lib/flight-coverage-types.ts` +
  `lib/flight-coverage.ts`).
- Sample-data folder names follow `<slug>-samples/` for `LayerViewer` and
  `Model3D`, but `VoxelTerrain` uses `minecraft-samples/`, `VideoTour`'s
  showcase demo uses `showcase-samples/demo-house/`, and
  `FlightCoverageAnalyzer` uses `flight-coverage-samples/` — named after the
  epic/feature, not derived mechanically from the slug.
- The literal, guaranteed-live usage snippet lives in each showcase page's
  `USAGE_CODE` constant; only 4 of 12 docs pages additionally carry a
  `## Usage` section of their own.

A future component that doesn't fit even this looser shape should still be
handled by reading what's actually there, per the steps above, rather than
forcing it into either mode's default template.
