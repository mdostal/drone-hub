# /flight-control — drone hardware/SDK control tools (not bundled, not scoped yet)

**This directory is documentation-only, and not yet prioritized.** No scripts, no SDK
integration, no runtime code lives here — see CLAUDE.md's "Vision addition (operator,
2026-08-09) — a third pillar" section for the full context. This README exists to reserve
the *shape* of this pillar, not to start building it.

## What this directory is for

drone-hub's two existing pillars both work with data that already exists:

- `components/` — **UI**: plug-and-play React components, imported into apps.
- `/pipeline` — **post-processing**: turns already-captured raw footage/telemetry into
  usable assets (WebODM, GDAL/rio-\*, PDAL, ffmpeg, exiftool).

`/flight-control` is the third pillar: tools for actually **commanding a drone** —
planning and executing real flight missions before any footage exists yet. Concretely, the
kind of thing this would eventually cover:

- Automated nadir-grid mission generation at multiple altitudes (the exact pattern
  `<FlightCoverageAnalyzer>` judges after the fact — this pillar would be what *plans* that
  grid before flying it, not just scores it afterward).
- Orbit / fly-around mission patterns.
- Whatever SDK/API actually gets picked (see "Open question" below) for uploading and
  executing a generated mission on a real aircraft.

Same discipline as `/pipeline`: a sibling of `app/`, `components/`, and `lib/` specifically
so it's structurally obvious it never enters the Next.js bundle — none of this is an npm
dependency, none of it ships to Vercel.

## Open question (real, unresolved — do not assume an answer)

CLAUDE.md's Phase-0 section already flagged this before this pillar was even named:
**does anything actually control a DJI Mini 5 Pro's flight path?** DJI locks Mini-class
drones out of parts of its own SDK. Candidates, none evaluated yet:

- **DJI Mobile SDK / DJI Cloud API** — official, but SDK access for Mini-class aircraft is
  the specific open question above.
- **Litchi Mission Hub** — third-party waypoint missions, has an API/CSV mission format;
  Mini 5 Pro support unconfirmed.
- **Dronelink** — similar third-party waypoint tooling; Mini 5 Pro support unconfirmed.

Resolving which (if any) of these actually works with this specific aircraft is the real
first step whenever this pillar gets prioritized — not something to guess at or build
around speculatively.
