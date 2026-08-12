# Research brief — tools-skill-layer

## Requirement (verbatim, operator)

> "an mcp and skillset for the tools and how to use or install these and
> work on them and then for the pipeline themselves as well"

Follow-up to being asked whether skills/MCP already existed for drone-hub's
tooling — they don't. Nothing in this repo, `personal-drone`, or the user's
global `~/.claude` config wraps drone-hub's components or pipeline as a
Claude Code Skill or MCP server. Confirmed by direct search:
`find . -iname "SKILL.md"` and MCP-config greps returned nothing in this
repo. The only skill-shaped file in the whole drone ecosystem is
`personal-drone/apps/portal/.agents/skills/supabase/SKILL.md`, a generic
Supabase skill unrelated to drone-hub's own tools.

## Current state, verified by reading the files

### Three pillars (CLAUDE.md, "Vision addition" 2026-08-09)

1. `components/` — UI. Real, mature. 7+ shipped components (VideoTour,
   LayerViewer, Model3D, LandOverlay, VoxelTerrain, ContentEngine,
   MinecraftExport) plus utility components (FileUpload, FileList,
   ProcessingStatus, FlightCoverageAnalyzer, TourBuilder) — 12 docs pages
   total under `docs/components/*.md`, all with real usage snippets.
2. `/pipeline` — post-processing (WebODM/GDAL/rio-*/PDAL/tippecanoe).
   **Documentation-only. Zero scripts.** `pipeline/README.md` is
   substantial — it already documents the exact, real command sequence for
   two of three conversions (ortho reprojection + hillshade, mesh
   conversion), each cited back to commands this repo has *actually run*
   building land-overlay/model3d. Only the third (ODM invocation itself,
   and the manifest-assembly step) isn't yet documented as commands,
   though those commands exist too (see below).
3. `/flight-control` — pre-flight mission planning / in-flight SDK control.
   Documentation-only, explicitly unscoped (open question: does
   Litchi/Dronelink/DJI SDK support Mini-class waypoint control — never
   evaluated). **Out of scope for this epic per operator's original framing
   and CLAUDE.md's explicit queuing.**

### The stale premise in `pipeline/README.md`

Its "Why documentation-only" section says: *"There is, right now, no real
`odm_orthophoto.tif`/`odm_dem.tif`/`odm_texturing` output anywhere to run a
conversion script against."* **This is no longer true.** The v0/v1/v2 Prado
nadir+oblique OpenDroneMap reconstruction (this session, documented in
`~/Desktop/drone-jobs/2026-08-08_prado_flight2/05_ortho/README.md`) produced
exactly that output twice over (v1 nadir-only, v2 nadir+oblique), including
a full raw ODM project archived at
`~/Desktop/drone-jobs/.../v2/odm-full-output/` (odm_orthophoto, odm_dem,
odm_texturing, odm_georeferencing, odm_report — real, on disk, ~2.9GB
pre-compression). The scripts `pipeline/README.md` deferred writing can now
be written against real input and validated against real, already-produced
output (the compressed `layer-viewer-samples`/`model3d-samples` deliverables
are the known-correct answer key).

### The real, proven command sequence (from `pipeline/README.md` + this
session's actual v1/v2 runs — not new speculation)

1. **Ortho reprojection**: `rio warp --dst-crs EPSG:3857 --resampling
   bilinear` → `rio cogeo create` → `rio cogeo validate`.
2. **Hillshade**: `gdaldem hillshade -az 315 -alt 45` (or, as this session's
   v1/v2 actually did it, a custom Lambertian-hillshade Python script — both
   compute the same illumination model) → same warp/cogeo/validate chain.
3. **Contours**: `gdal_contour`, or (as this session actually did it) a
   custom `skimage.measure.find_contours`-based vectorizer.
4. **Mesh conversion**: `obj2gltf` (OBJ+MTL+textures → glb) → optional
   `gltf-transform` chain. This session's real v2 run additionally needed
   two steps `pipeline/README.md` doesn't yet document: a `trimesh`-based
   per-material spatial crop (needed because the oblique-orbit sweep's
   far-outlier vertices blew out `<Bounds fit clip observe>`'s auto-framing)
   and a custom Y-up axis-correction step that must run *before* Draco
   compression (the custom script's Draco decoder isn't wired for
   already-Draco-compressed input).
5. **ODM invocation itself** (not yet in `pipeline/README.md` at all):
   `exiftool -ee -G3 -json -n` GPS extraction from source clips written back
   onto extracted frames as EXIF, before feeding to ODM's docker CLI. Two
   real, non-obvious operational fixes this session had to discover the hard
   way: Docker Desktop's memory allocation must be ≥16GB
   (`~/Library/Group Containers/group.com.docker/settings-store.json`'s
   `MemoryMiB`) or `DensifyPointCloud` segfaults under x86-on-ARM64
   emulation; and ODM's dataset-stage cache (`img_list.txt`, `images.json`)
   must be wiped as a whole directory between reruns with a changed image
   set, never partially deleted, or it breaks with `FileNotFoundError`
   instead of gracefully rescanning.

### Manifest shapes the pipeline must emit

`lib/layer-types.ts`'s `LayerDef`, `components/Model3D/Model3D.tsx`'s
`ModelDef`, and `lib/geo-model-types.ts`'s `GeoAnchoredModel` are the three
target shapes `pipeline/README.md` already maps ODM output onto, with
worked-example JSON for each. `pipeline/README.md`'s own planned shape names
a `scripts/build-manifest.py` that assembles these — described but not
written.

### Component "install/use" reality

No npm package is published — CLAUDE.md's stack decision is explicitly
"BUILD & own the viewer", not publish-and-consume via a registry. Every
`docs/components/*.md` usage snippet assumes the component file already
exists at `@/components/<Name>` in the importing app. "Install" realistically
means: copy the component + its typed manifest shape + its sample-data
convention into an external Next.js app, matching shadcn/ui's own CLI UX
model (CLAUDE.md explicitly frames drone-hub as "shadcn-style").

### Existing Hive scaffolding

`component-team.yaml` (`.pHive/teams/component-team.yaml`) domain is
`components/**` + `lib/**` — building the viewer components. This epic's
work (`.claude/skills/**`-shaped content, `pipeline/**` scripts, an MCP
server) sits outside that domain; no existing team owns it. `hive.config.yaml`
sets `execution.default_methodology: bdd` repo-wide, with the same file's own
comment noting TDD fits "complex backend/logic units" better — infra/scripting
work (pipeline scripts, MCP plumbing) is the same shape of exception.

### MCP hosting — resolved, not left open

No MCP server infra exists in this repo (no `@modelcontextprotocol/sdk` in
`package.json`, no `mcp/` dir). The repo is Vercel-hosted and
bandwidth-conscious — but that's irrelevant here, because the standard MCP
deployment shape for a repo-scoped tool server is a **local stdio process**,
spawned by the MCP client (Claude Code itself, via a project-level
`.mcp.json`) — not a hosted HTTP service. This session's own tool list
already includes several stdio MCP servers configured exactly this way
(`mcp__plugin_playwright_playwright__*`, `mcp__posthog__*`, etc.). No
Vercel/hosting decision is actually required — the server ships as a small
Node script + a `.mcp.json` entry, reading `docs/components/*.md` directly
off disk. This resolves what the planning brief flagged as an open question.

## Scope boundaries carried into design discussion

- `/flight-control` excluded — confirmed above, no real work to wrap yet.
- Real property data pipelines stay local-only (per CLAUDE.md's scope
  boundary — real assets never enter this repo's `public/` beyond the
  already-committed 2806 Prado samples); pipeline scripts operate on
  whatever local raw footage/ODM output the user points them at, same as
  the one-off commands did this session.
