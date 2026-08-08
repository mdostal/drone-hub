# Design discussion — framework docs site

## 0. Prelude

No prior KG decisions surfaced (no `/hive:why` tooling wired for this repo's
ad-hoc planning). No `north_star` block in `.pHive/project-profile.yaml`.
This epic follows directly from CLAUDE.md's 2026-08-08 scope-boundary
correction and the operator's explicit request: "ensure that we have a solid
full documentation set including basically having a main page with all of
these components being in a table of contents etc so that tools.mdostal.com
can link to and host the drone tools and we can see them all."

## 1. Goal

`drone-hub` is `@dostal/framework` — a component library + its own public
demo/showcase site (CLAUDE.md's 2026-08-08 correction is explicit: not the
client platform). Six pieces of work already shipped this session
(video-tour, layer-viewer, model3d, land-overlay, minecraft-content-engine,
minecraft-export), each with a thorough `docs/components/*.md` writeup — but
those docs are dead files. Nothing in the app renders them, and the one
index page that exists (`/components`) only links to live demos, missing two
real surfaces (content-engine, minecraft-export) entirely. The root URL `/`
— the one address an external link (tools.mdostal.com) would actually
point at — is a placeholder that says nothing.

The goal: make `/` the real front door. One table of contents, every
component/tool listed once, each entry links to both its live demo and its
doc writeup, and both links actually resolve.

## 2. Proposed approach

**Landing page consolidation.** `/` becomes the table-of-contents page.
`/components` currently duplicates this purpose with a narrower list — rather
than maintain two divergent ToCs, `/components` redirects to `/` via a
`next.config.ts` `redirects()` entry (permanent structural redirect, not
conditional logic — keeps the route list in one place). This requires two
explicit cleanup actions, not just adding a redirect:
1. **Delete `app/(showcase)/components/page.tsx`** once its ToC content
   moves to (and is superseded by) `app/page.tsx`. A `next.config.ts`
   redirect fires before Next's filesystem router reaches the page, so
   leaving the file in place would mean the real HTTP route never renders
   it — a dead file.
2. **Delete `app/(showcase)/components/page.test.tsx`** (which currently
   does `render(<ComponentsIndexPage />)` and asserts on the ToC cards
   directly, bypassing routing) and re-home equivalent ToC-rendering
   coverage as `app/page.test.tsx` against the new root page. Otherwise the
   old test keeps passing forever (RTL renders the component in isolation,
   not through the redirect) while asserting on a component that's no
   longer reachable — a false-green test masking a dead route.

**Doc rendering.** New route `/docs/components/[slug]`, a Server Component
that reads `docs/components/<slug>.md` from disk (`fs.readFileSync`,
`path.join(process.cwd(), "docs", "components", ...)`) at request time,
parses it, and renders it. `generateStaticParams` enumerates the slugs as a
**hardcoded literal array of the 7 known slugs** (`video-tour`,
`layer-viewer`, `model3d`, `land-overlay`, `voxel-terrain`, `content-engine`,
`minecraft-export`) — not a `readdirSync` scan of `docs/components/`. That
directory also contains a `reference/` subdirectory
(`docs/components/reference/prado-tour.prototype.html`, the video-tour
epic's prototype-as-spec reference, unrelated to this feature); an
unfiltered `readdirSync`-based enumeration would pick up `"reference"` as an
entry and a subsequent `readFileSync` on it throws `EISDIR` at build time.
The hardcoded array sidesteps this entirely and matches the "known slugs"
framing — the ToC data (same 7 entries, declared once) is the same list
read twice, not a second source of truth to keep synced. All seven
prerender at build time (static prose content, no reason to leave it
dynamic).

Markdown rendering: `react-markdown` (no plugins beyond `remark-gfm` for
task-list checkboxes, since several of these docs use `- [x]` checklists).
Justification: it's the standard, well-maintained React markdown renderer,
zero `dangerouslySetInnerHTML`, tree-shakes fine, and — critically — these
docs are our own committed content, not user input, so the security profile
that makes people reach for heavier sanitizing pipelines doesn't apply here.
Rejected alternatives: `next-mdx-remote` (MDX's whole value proposition is
embedding JSX components inside prose — none of these docs need that, it's
a heavier dependency for a feature we won't use) and hand-rolled `marked` +
`dangerouslySetInnerHTML` (saves one dependency but reintroduces exactly the
sanitization question `react-markdown` sidesteps for free).

Code fences render as plain `<pre><code>` — no syntax highlighter. These are
mostly TypeScript/YAML/bash snippets in prose docs, not a code-reading
product surface; a highlighting library is more dependency than the actual
need justifies here.

**Table-of-contents entries.** Extend the existing 5-entry list to 7:
add ContentEngine (demo: `/properties/2806-prado/engine`, gated — the ToC
card says so explicitly, e.g. a small "passcode-gated demo" badge, rather
than link silently into a redirect-to-login) and MinecraftExport (no demo
page of its own — it's a download action already surfaced on the
VoxelTerrain showcase page — so its ToC entry links to its doc page only,
with a note that the live action lives on the VoxelTerrain page). Every
entry gets a doc-page link now that `/docs/components/[slug]` exists.

**No new sample data, no new viewer tech, no gating changes.** Purely
additive: two new/changed routes, one redirect, one new dependency.

## 3. Risks

- **Broken links are worse than no links.** Every demo + doc href in the
  ToC must resolve to a real 200 (or, for content-engine, a real gate
  redirect that isn't presented as broken). Mitigated by a test that walks
  the ToC data and asserts every doc slug has a matching `docs/components/*.md`
  file on disk, plus Playwright coverage of the doc route rendering for at
  least one slug.
- **Markdown source drift.** The docs are already dense/long
  (layer-viewer.md's closeout section alone runs 200+ lines) — rendering
  needs to handle nested lists, code fences, bold/italic mixed with inline
  code without visually breaking. `remark-gfm` covers the GFM task-list
  checkbox syntax (`- [x]`/`- [ ]`) used extensively in `layer-viewer.md`,
  `video-tour.md`, and `model3d.md`'s acceptance-criteria sections — plain
  `react-markdown` without it renders those as literal `[x]` text, not
  checkboxes. (No doc actually uses GFM pipe tables — grepped all 7, zero
  `|---|` separator rows — so the dependency's job here is task-lists, not
  tables.) `content-engine.md` is the structurally densest doc (nested
  numbered lists with bold+italic+multiple inline-code spans per line, an
  ASCII directory-tree code block, 3 separate fenced code blocks) — use it
  as the spot-check target during execution rather than assuming default
  `react-markdown` styling is
  sufficient.
- **`fs.readFileSync` against `docs/` at request time on Vercel.** Next.js's
  build tracer needs to know to include `docs/**` in the serverless
  function's file trace, or this 404s in production despite working in
  `next dev`. Since every doc slug is enumerable and known at build time
  (`generateStaticParams`), pages should fully prerender to static HTML —
  which sidesteps the runtime-fs-read risk entirely, since a prerendered
  page never touches `fs` after build. Flag this explicitly as an
  acceptance criterion: verify with `next build` that these routes render
  as `○ (Static)`, not `ƒ (Dynamic)`.

## 4. Dependencies

- `react-markdown` + `remark-gfm` (new, small, well-maintained — not a
  CLAUDE.md-locked dep, but consistent with the "own the viewer, minimal
  deps" ethos; this is prose rendering, not a viewer).
- Reads `docs/components/*.md` — must stay in sync content-wise, but this
  epic changes zero prose content, only how it's surfaced.

## 5. Open questions

1. Should `/docs/components/[slug]` have any nav chrome (back-to-ToC link,
   breadcrumb) or render the markdown alone? — Recommend a minimal shared
   layout: a "← Components" link back to `/`, nothing more. Consistent with
   every other showcase page's minimal chrome.
2. Does the ToC need visual grouping (e.g. "Components" vs "Tools") or is a
   flat list of 7 fine? — Recommend flat list; 7 items doesn't need
   taxonomy yet, and CLAUDE.md doesn't prescribe categories.

## 6. Scale assessment

**Small.** Two new routes, one redirect, one dependency add, no new gating,
no new sample data, no new viewer tech. Proceeding directly to stories
(skipping H/V planning) per the plan skill's small-scope routing.
