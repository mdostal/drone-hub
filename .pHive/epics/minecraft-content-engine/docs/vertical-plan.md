# Vertical Plan — Minecraft voxelizer + content-engine page

## Slice 1 — Foundations (2-way parallel)
- `minecraft-types-and-heightmap` — `lib/voxel-types.ts` + the offline
  hillshade→heightmap-grid derivation, output as sample JSON.
- `minecraft-content-engine-data` — `lib/flight-log-types.ts` (minimal,
  scoped to this epic) + the sample-house fallback engineering/flight-log
  content.

## Slice 2 — The component
`minecraft-voxel-terrain-component` — `<VoxelTerrain>` + `<VoxelStructure>`,
proven with real instanced-mesh performance, live-verified.

## Slice 3 — Two consuming pages
- `minecraft-showcase-page` — public `/components/voxel-terrain`.
- `minecraft-content-engine-page` — gated `/properties/[slug]/engine`, with
  the per-slug real-vs-fallback resolution + explicit banner.

## Slice 4 — Tests + close-out
- `minecraft-test-suite`
- `minecraft-docs-acceptance-closeout`

## Deferred (queued next per CLAUDE.md's confirmed priority order)
- Telemetry-driven scene-tracked video overlay (will define its own type
  for whatever camera-pose computation actually needs — not
  `FlightLogEntry` as speculatively pre-designed, per this epic's own
  grill-corrected decision).
- CBA's original Phase 2 tools (Measure/Annotate/Compare/Align).
- Hardening `sanitizeNextPath`/`GATED_PATH_PREFIXES` from unanchored
  string-prefix matching to real path-boundary matching (a pre-existing
  characteristic, not introduced by this epic, flagged during grill review).
