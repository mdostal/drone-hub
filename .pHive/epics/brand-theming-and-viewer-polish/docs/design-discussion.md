# Design discussion — brand theming + LayerViewer/Model3D viewer polish

## 0. Prelude

No prior KG decisions surfaced. No `north_star` block. This epic bundles three
requests from a single operator message, all pointing at the same underlying
problem: the framework looks and behaves like an unstyled scaffold, not a
"genuinely complete, publicly-hostable" showcase (CLAUDE.md's own bar). Verbatim:
"Get some solid styling and theming across the board there that ties it to the
rest of the mdostal brand -- keep it separate but similar." / "go check and look
at the overlays -- we can do better than that, it just shows a dark random
outline, let's do a 3d model overlay or different levels with thermals and
stuff -- lots of cleaning basically." / "add the measure and stuff the 3d
CLAIMS and give a little legend on the side with what controls are to do the
different actions."

## 1. Goal

Three concrete deliverables:
1. A real design system (`app/globals.css`'s `@theme{}` is currently empty)
   applied site-wide, visually related to the mdostal.com family without
   being a copy of any one of them.
2. Fix `<LayerViewer>`/`<LandOverlay>`'s actual broken-looking output — the
   sample "ortho" layer renders as a near-solid black shape — plus add the
   thermal layer (currently a permanent `disabled` stub) and a contours
   layer (named in CLAUDE.md's original target layer list, never built).
3. `<Model3D>`'s own docs/copy already claim "orbit-**and-measure**" — build
   the actual measure tool, plus a small on-canvas legend explaining the
   controls (orbit is currently undocumented in the UI itself, not just
   measure).

## 2. Research: current state (verified directly, not assumed)

- `app/globals.css`: `@theme {}` is genuinely empty — "Design tokens land
  here as brand-system/design-token work is done. Intentionally empty for
  this scaffold." Every page uses raw Tailwind neutrals (`bg-black`,
  `text-neutral-600`, `border`) with no shared token layer.
- **mdostal.com family design tokens** (pulled from each site's actual
  compiled CSS, not guessed):
  - `mdostal.com`: shadcn HSL-variable system, toggle-based dark mode.
    Light `--primary: #c25100`, dark `--primary: #ff6600`. Font: Inter.
    `rounded-xl` cards, `border` + `shadow-lg hover:shadow-2xl
    hover:shadow-primary/10` (shadow-heavy).
  - `tools.mdostal.com`: dark-first via `prefers-color-scheme` (no toggle
    — genuinely supports both, OS-driven). Dark `--background:#050505
    --surface:#0f0f0f --border:#27272a --foreground:#f4f4f5
    --accent:#ff6b00`. Light `--background:#fafafa --surface:#fff
    --border:#e4e4e7 --foreground:#18181b` (accent unchanged). Font: Inter
    (UI) + monospace (logo/tags — "maker/technical" accent). `rounded-xl`
    cards, **border-only** hover (`hover:border-accent/50`), no shadow.
    "Live" status = `rounded-full` accent dot + text.
  - `life.mdostal.com`: dark-only, `bg-stone-950` (#0c0a09), DM Sans +
    Playfair Display, `amber-400/500` (#fbbf24/#f59e0b) accent, emoji
    icons, hover-reveal borders (invisible → visible on hover).
  - **Cross-family constant**: `rounded-xl` (12px) card radius,
    `rounded-full` pills, warm-orange accent hue band (~20–30°) with each
    site picking its own distinct exact value (#ff6600 / #ff6b00 /
    #fbbf24), border-reveal-on-hover as the shared card idiom, Inter as the
    default/utilitarian font (swapped only on the one editorial/personal
    site). No two sites share an exact accent hex.
- `docs/components/reference/...` prototype is gone (unrelated, prior epic).
- **The ortho render bug, root-caused**: `public/layer-viewer-samples/2806-prado/ortho.tif`
  is `docs/components/layer-viewer.md`'s own documented sample — rio-tiler's
  test-fixture COG, **single-band uint16**, not 3-band visual RGB imagery.
  MapLibre's raster layer draws it directly with no stretch/normalization,
  and the fixture's actual pixel values sit far below the uint16 ceiling —
  the result is a flat near-black shape, confirmed live via Playwright
  screenshot on `/components/land-overlay`. This is a **sample-data defect**,
  not a rendering-code bug — `buildLayerMapConfig` in
  `components/LayerViewer/LayerViewer.tsx` does exactly what a real 3-band
  COG needs (`cog://` protocol, no special-casing required).
- `lib/layer-types.ts`'s `LayerDef.legend`/`format` fields are the only
  per-layer style hooks that exist. There is **no per-layer visual-style
  field** (fill/line color, line-only vs. fill+line) — `LayerViewer.tsx`'s
  `buildLayerMapConfig` hardcodes `#22c55e` (green) fill+line for every
  `type: "geojson"` layer, no exceptions. A contours layer sharing that
  exact treatment would look identical to the parcel boundary — visually
  indistinguishable, which defeats the point of adding it.
- `components/Model3D/Model3D.tsx`: mounts `<Canvas>` + `<Bounds>` +
  `<OrbitControls makeDefault />` and nothing else. No raycasting, no click
  handling, no HTML overlay, no legend/help UI of any kind. The `showcase
  page` renders it in a bare bordered box with zero on-canvas chrome —
  confirmed via live screenshot (just the duck on black, no UI at all).
  `docs/components/model3d.md` itself states measure was "explicitly
  deferred" at build time — the "orbit-and-measure" copy in
  `README.md`/`package.json`/`app/page.tsx`'s ToC has been describing an
  unbuilt feature since it was first written.

## 3. Proposed approach

### 3a. Design system

New `@theme` tokens in `app/globals.css`, dark-first via
`prefers-color-scheme` (matching `tools.mdostal.com` exactly — the direct
sibling drone-hub is actually listed under, the closest precedent, and the
simplest mechanism: no toggle, no client JS, no stored preference).

- **Accent**: `#e8590c` — HSL(21°, 90%, 48%). **Grill finding #6:** the
  distinguishing mechanism is saturation/lightness, not hue — hue alone is
  only 3-4° from `#ff6600`/`#ff6b00` (would read as "the same orange" on
  hue alone), but this is a darker, more muted "burnt orange" (90%
  sat/48% light) against the siblings' fully-saturated vivid orange (100%
  sat/50% light): RGB Euclidean distance ~29-31 from either sibling, vs.
  the two existing sites' own mutual distance of just 5 — i.e. more
  distinct from either sibling than they are from each other. Stays in the
  family's warm-orange hue band (so it still reads as related) while being
  clearly a different, muted shade (so it doesn't read as a copy). Do not
  pick a replacement color by hue alone if this value changes later —
  match on the S/L contrast, not the hue band.
- **Dark** (default): `background #09090a`, `surface #131316`, `border
  #27272a`, `foreground #f4f4f5`, `muted #9ca3af`.
- **Light** (`prefers-color-scheme: light`): `background #fafafa`, `surface
  #ffffff`, `border #e4e4e7`, `foreground #18181b`, `muted #52525b`.
- **Font**: Inter (`next/font/google`, self-hosted) — matches 2 of 3 family
  sites and is already the implicit default; no reason to introduce a new
  font family for a technical/tools-adjacent surface (that's
  `life.mdostal.com`'s differentiator, not a fit here).
- **Radius**: `rounded-xl` (12px) cards, `rounded-full` pills/status dots —
  the one true cross-family constant.
- **Card treatment**: `border` + `hover:border-accent/50`, **no shadow** —
  matches `tools.mdostal.com`'s flatter idiom, and is the right call
  functionally too: drone-hub's cards sit above map/3D canvases that
  already carry real visual weight, so a shadow-heavy treatment would
  compete rather than frame.
- **Status pill**: reuse the family's dot-badge convention (`h-1.5 w-1.5
  rounded-full bg-accent` + text) — already half-built as the "passcode-gated
  demo" pill pattern before that badge was removed; same shape now used for
  the "Live"-style tag on the landing page(currently plain colored spans).

Apply scope (site-wide means every page, not just the landing page):
`app/layout.tsx` (font), `app/globals.css` (tokens), `app/page.tsx` (ToC
cards), `components/showcase.tsx` (`<ComponentShowcase>` — the shared
wrapper every `/components/*` showcase page renders through, so fixing it
once fixes all five), `components/LayerViewer/LayerControl.tsx` (currently
hardcoded `bg-black/80`-style dark panel regardless of site theme),
`app/(showcase)/docs/components/[slug]/page.tsx` (doc-page chrome + the
`react-markdown` rendering itself — headings/links/code blocks currently
use bare Tailwind neutrals with no accent color anywhere), VoxelTerrain's
download button, Model3D's new legend (3c below).

### 3b. LayerViewer/LandOverlay data + rendering fixes

**Revised after grill (finding #2, #3): this is a full regenerate of one
internally-coherent sample dataset, not a patch of the existing files.**
The grill's direct `rasterio` inspection found the current
`hillshade.tif` is genuinely continental-scale — 522×549px over a
~1,000km×950km extent, ~1823 m/pixel — while `parcel.geojson`'s rectangle
is ~120m×100m: roughly 1/15th of a *single* hillshade pixel. Deriving new
"thermal"/"contours" layers from that array (the original 3b.2/3b.3 plan)
would produce geometry at the wrong scale entirely — invisible or
absurd once zoomed to the parcel. Separately, real rights-clear aerial/drone
imagery sourced from the open internet (for the ortho replacement) is
essentially never going to happen to be georeferenced at the current
sample's ~73.47°N Arctic coordinates, so swapping the ortho alone — while
leaving `parcel.geojson` and the `<LandOverlay>` duck's lat/lon anchored to
the old location — would silently break the "boundary + ortho + model all
register to one grid" story (CLAUDE.md's own "#1 registration gate").

The fix: generate one new, real small-area location and build every layer
at THAT location and scale, together, so they're internally consistent —
not reuse-and-patch the old arctic/continental-scale files.

1. **Source a real, small-scale, genuinely visual 3-band RGB ortho.** A
   public-domain small-area aerial/drone orthophoto — e.g. a cropped USGS
   NAIP tile (public domain, ~0.6–1m resolution, covers property-scale
   areas) or a small real orthomosaic from a permissively-licensed source
   (OpenAerialMap-style). Reproject to EPSG:3857 (`rio warp` + `rio cogeo
   create`/`validate`, the established convention). Whatever real small
   extent this imagery naturally covers (a few hundred meters is plenty)
   becomes the new sample location — don't force it to match the old
   Arctic coordinates or invent a fake address.
2. **Generate a NEW synthetic hillshade/DEM at the SAME extent/resolution
   as the new ortho** (not reusing the old continental-scale file) — same
   technique as before (procedural elevation field → hillshade render via
   `rasterio`/`numpy`), this time actually scaled to a property, not a
   continent.
3. **Generate the thermal layer from an independently-varied synthetic
   intensity field** (a separate procedural pass, not the literal same
   array the hillshade uses — grill finding #4: two layers colorized from
   one identical source would show identical ridgelines under different
   palettes, which reads as an obvious tell rather than two distinct
   layers), LUT-mapped through an ironbow colormap at the new extent.
   `layers.json`'s thermal entry flips `disabled: false, url:
   "thermal.tif"`, legend stays `"synthetic placeholder — not real
   radiometric data"` (existing convention, unchanged wording pattern),
   `toggle: false` by default.
4. **Add a contours layer** (CLAUDE.md's own original target layer list
   names it; never built) — derive real contour lines from the NEW,
   correctly-scaled DEM (`skimage.measure.find_contours` or equivalent,
   pixel space → the COG's real geo-coordinates) as a GeoJSON
   `MultiLineString`/`LineString` FeatureCollection. At parcel scale this
   now produces geometry that actually looks like elevation contours
   within the visible extent.
5. **Regenerate `parcel.geojson`** as a placeholder rectangle within the
   NEW ortho's real extent (same "centered on the ortho, synthetic
   placeholder, not a real parcel" convention — just re-anchored).
   **Update `<LandOverlay>`'s sample duck lat/lon** (`app/(showcase)/components/land-overlay/page.tsx`'s
   `SAMPLE_MODELS`) to sit inside the new extent — a required cascading
   change (grill finding #2), not optional cleanup.
6. **Extend `LayerDef` with an optional `style` field** (fill color, line
   color, or a `lineOnly: boolean` flag) so geojson layers can visually
   differentiate — contours as thin accent-colored lines with no fill,
   distinct from the boundary's green fill+outline. Confirmed additive by
   the grill: `buildLayerMapConfig`'s own tests assert on its *output*,
   not on `LayerDef`'s input shape, and `lib/layer-types.test.ts`'s
   literal-shape check uses `toEqual`, which treats an absent optional key
   as absent regardless of the type adding it — existing manifests/call
   sites need zero changes.
7. **Update `public/layer-viewer-samples/2806-prado/manifest.test.ts`'s
   two hardcoded assertions** the grill found and this doc's first draft
   missed entirely: `"matches CBA's exact thermal stub shape"` (asserts
   `disabled: true, url: null` — now false) and `"has exactly the four
   expected layer ids"` (now five, with `contours` added). Both need
   rewriting to match the new manifest shape, not just the new files
   existing on disk.
8. Once the new ortho/scale is in place, re-verify `<LandOverlay>`'s duck
   reads clearly against real imagery at its updated location (its
   lighting fix already landed in an earlier epic — this is verification,
   not new model-overlay work).

### 3c. Model3D measure tool + controls legend

1. **Measure tool**: click-to-place two points on the mesh surface via
   three.js `Raycaster` against the loaded glTF scene, draw a line between
   them (a thin `Line` object, accent-colored) and a floating distance
   label (drei's `<Html>`, positioned at the segment midpoint). A "Measure"
   toggle button enters/exits measure mode — orbit-drag and
   click-to-measure must not conflict, so a placement only registers on a
   genuine click (mousedown+mouseup within a small pixel/time threshold at
   the same screen position, not a drag) while measure mode is active.
   Distance displays in raw glTF units, honestly labeled `"units"` — there
   is no real-world scale for the sample duck (or for `<Model3D>` in
   general, until a real photogrammetry pipeline supplies one), so claiming
   "meters" would be a fabricated precision the component doesn't have.
   `ModelDef` gets an optional `unitsPerMeter?: number` scale hint for a
   *future* real-data caller to opt into real-unit display — absent (the
   sample duck's case), the label stays `"units"`.
   **Grill finding #5 — a real implementation gotcha, not optional:**
   `Model3D.tsx` currently wraps only `<GltfScene>` inside `<Bounds fit
   clip observe margin={1.2}>`; `observe` recomputes the camera fit from
   the bounding box of everything `<Bounds>` wraps. Measure-point markers
   and the connecting `Line` MUST render as `<Canvas>`-level siblings
   *outside* `<Bounds>` (or otherwise excluded from its bounds
   computation) — placed inside it, each new measurement point grows the
   wrapped bounding box and triggers an unwanted camera re-frame/zoom
   mid-measurement. `<Html>`'s distance label is a DOM portal and is
   unaffected either way.
2. **Controls legend**: a small fixed-corner panel on the canvas (not a
   separate page element — "on the side" per the operator's own words)
   listing what's actually interactive right now: drag-to-orbit,
   scroll-to-zoom, the Measure toggle, and (once active) click-two-points
   + a Clear-measurements action. Themed via 3a's tokens once those exist —
   sequencing matters here (3a before 3c).

## 4. Risks

- **Sourcing a real, good-looking, rights-safe RGB ortho sample is the
  highest-uncertainty item in this epic.** Unlike the rest of this session's
  "confirm a public-domain glTF/COG exists" steps, this one has a real
  chance of coming back empty (small, genuinely public-domain, visually
  compelling aerial imagery, pre-packaged as a valid COG, is a narrower
  search than it sounds). Mitigation: the implementing story's acceptance
  criteria must include a documented fallback if no ideal source is found
  — generate a clearly-labeled synthetic-but-photographic-looking ortho
  (e.g., a real public-domain aerial photo, even if not already COG-ified,
  converted via `rio cogeo create`) rather than blocking the epic on
  finding a "perfect" pre-made COG.
- **The whole sample dataset (ortho/hillshade/thermal/contours/boundary/duck
  anchor) must be regenerated together at one new, real, internally
  consistent location and scale — not patched piecemeal.** (Grill findings
  #2, #3 — see §3b's revision.) Skipping any one of the cascading updates
  (parcel.geojson's location, the duck's lat/lon, `manifest.test.ts`'s
  hardcoded thermal-stub/layer-id assertions) leaves the demo internally
  inconsistent or breaks CI outright. Treat §3b's 8-item list as one
  atomic story, not independently choosable sub-tasks.
- **Thermal and contours must be derived from genuinely independent
  synthetic sources, not the same array with two different renderers**
  (grill finding #4) — otherwise toggling between them visibly traces
  identical terrain, undermining the "distinct layers" demo.
- **`LayerDef.style` is a real, if small, breaking-adjacent API change** —
  existing consumers (the 5 showcase pages, `app/properties/[slug]/engine`
  indirectly via VoxelTerrain, `personal-drone`'s own submodule usage) all
  construct `LayerDef` objects. Making `style` optional with a sensible
  default (today's hardcoded green fill+line, unchanged) keeps this
  additive, not breaking — every existing manifest/call site keeps working
  with zero changes.
- **Raycasting + click-vs-drag disambiguation is genuine interaction-design
  risk** — get the threshold wrong and either orbiting accidentally drops
  measure points, or measuring requires an unnaturally precise click.
  Mitigation: this needs real Playwright verification of the actual
  click/drag boundary behavior, not just a unit test of the distance math.
- **Scope is large for one epic** — three largely-independent work streams
  (design system, LayerViewer data, Model3D feature) that only share the
  design-system dependency for their own UI chrome. Sequenced as vertical
  slices below specifically so 3a lands first and unblocks both 3b's and
  3c's UI polish in parallel.

## 5. Dependencies

- `rasterio`/`numpy`/`rio-cogeo` (already used this session for hillshade
  generation, COG reprojection) — same toolchain, no new dependency.
  `scikit-image` (`skimage.measure.find_contours`) is new — a common,
  well-maintained geo/imaging library, acceptable per this repo's existing
  "pipeline tools live outside the bundle" pattern (this is a one-time
  data-prep script, not a runtime dependency — same category as the
  hillshade-generation script that was never committed).
- `next/font/google` for Inter — zero new npm dependency (built into Next.js).
- No new runtime npm dependencies for the Model3D measure tool — `Raycaster`
  is core three.js (already a dependency), `<Html>` is already part of
  `@react-three/drei` (already a dependency, already imported elsewhere).

## 6. Open questions

1. Should the design tokens also flow into `app/enter-passcode`-style
   error/status text conventions? — Moot, that route no longer exists
   (removed in the gating-removal epic). No open question remains here.
2. ~~Does the contours layer need real elevation-derived geometry...~~ —
   **Superseded by §3b's revision.** The premise (reuse the *existing*
   hillshade array) turned out to be the grill's finding #3: that array is
   continental-scale and unusable for a parcel-scale demo regardless. The
   real answer is "derive from a newly-generated, correctly-scaled DEM,"
   which §3b now specifies directly — no longer an open question.

## 7. Scale assessment

**Medium.** Three real, mostly-independent work streams, one shared
dependency (design tokens must land before the other two's UI chrome), a
real new interactive feature (measure tool) with genuine interaction-design
risk, and one item with real sourcing uncertainty (the ortho replacement).
Proceeding to story decomposition without full H/V ceremony — the vertical
slices below are the practical equivalent for an epic this size, matching
this session's established pattern for medium-scope epics.
