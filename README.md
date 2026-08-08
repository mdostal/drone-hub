# @dostal/framework (drone-hub)

A shadcn-style component framework for drone property intelligence — plug-and-play
React components (a georeferenced map layer viewer, a 3D mesh/point-cloud viewer,
a geo-anchored model-on-map overlay, a video walkthrough player, a Minecraft-style
terrain voxelizer + real `.schem` exporter), each with its own live demo, usage
snippet, and full documentation page. **Own the viewer, buy only compute** — the
components render/compose everything client-side; heavy geospatial processing
(photogrammetry, terrain baking) is a separate, non-bundled pipeline.

**Full component directory + live demos:** every component lists its live demo
and doc page from the root `/` page of a running instance of this app.

## Components

| Component | What it does |
|---|---|
| `<LayerViewer>` | Toggleable, opacity-controlled georeferenced overlays (ortho/hillshade/boundary) draped on a satellite base map (MapLibre GL). |
| `<Model3D>` | Orbit-and-measure 3D mesh/point-cloud viewer (react-three-fiber). |
| `<LandOverlay>` | A geo-anchored 3D model composited directly onto `<LayerViewer>`'s map at a real lat/lon. |
| `<VideoTour>` | Scrollytelling walkthrough — steps a floor plan through doorway-linked video clips. |
| `<VoxelTerrain>` | Blocky, Minecraft-style terrain renderer built from a heightmap grid, with a real downloadable Sponge Schematic (`.schem`) export. |

Each component's `docs/components/*.md` file is the full spec/writeup, rendered
live at `/docs/components/<slug>` when this app is running.

## Stack

Next.js 15 (App Router) + React 19 + Tailwind 4, MapLibre GL + `@geomatico/maplibre-cog-protocol`
(COG raster layers) + `@turf/turf` (geo math), `three` + `@react-three/fiber` +
`@react-three/drei` (3D), `react-markdown` + `remark-gfm` (docs rendering),
deployed on Vercel. See `package.json` for the full dependency list and inline
notes on a couple of non-obvious version pins.

## Running locally

```
npm install
npm run dev
```

Everything in this repo is public, ungated, and safe to browse — there is no
passcode/auth layer of any kind here. All sample data (imagery, tours,
terrain, flight logs) is synthetic/placeholder; this repo never contains
real property content. (Real client-facing property data + access control
live in the separate, private `personal-drone` platform, which pulls this
repo in as its component library.)

## Testing

`npm test` runs the full Vitest + React Testing Library suite (jsdom,
config in `vitest.config.mts`) and **must pass before pushing** — there's no
CI wired up yet, so this is the pre-push check until that lands. Use
`npm run test:watch` while iterating. `npm run test:e2e` runs a small real-browser
Playwright suite (`lib/*.placement.test.ts`) for numeric geo-placement checks
that need a real WebGL context, not jsdom.

## Deployment

This app builds with a `basePath` (`/framework`, see `next.config.ts`) so it can
mount at `tools.mdostal.com/framework` via that hub's multi-zone rewrite pattern.
Set `E2E_NO_BASE_PATH=1` to disable it for local/E2E use against an unprefixed
root.

## License

MIT — see `LICENSE`.
