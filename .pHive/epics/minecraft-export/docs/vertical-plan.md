# Vertical Plan — Real Minecraft schematic export

## Slice 1 — The writer (highest risk, built and proven first)
`minecraft-export-schematic-writer` — proves the hard part in isolation: a
`Buffer` that is a real, spec-conformant Sponge Schematic.

## Slice 2 — Two consumers (parallel)
- `minecraft-export-api-route` — a real downloadable file over HTTP.
- `minecraft-export-test-suite` — the hand-verified golden fixture proving
  spec conformance (not just self-consistency), plus the DataVersion
  cross-reference.

## Slice 3 — The actual feature surface
`minecraft-export-ui` — download buttons where a human can actually use
this.

## Slice 4 — Close-out
`minecraft-export-docs-acceptance-closeout`.

## Deferred
- Real WebODM DSM → heightmap ingestion (this epic's exporter is decoupled
  from data source already — takes a VoxelGrid regardless of provenance —
  so no rework needed once real data exists, but the actual WebODM
  pipeline itself is still gated on the Phase-0 nadir pass).
- Full Anvil-format world export (region files, level.dat, etc.) — explicitly
  out of scope; a schematic is the correct target for "download and paste a
  build," not a full world.
- CBA's original Phase 2 tools (Measure/Annotate/Compare/Align).
