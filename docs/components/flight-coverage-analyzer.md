# `<FlightCoverageAnalyzer>` — nadir-grid overlap judge

> Given a set of drone flight passes (per-frame GPS + altitude telemetry), judges whether
> they constitute a photogrammetrically valid capture — a real multi-line grid with
> adequate side overlap, or a single wide-altitude pass whose footprint alone covers the
> target — with a green/amber/red verdict, instead of eyeballing a flight map. Plug-and-play,
> importable into any app, publicly showcased at `/components/flight-coverage-analyzer`.

## Why this exists

The operator flew two real nadir passes over 2806 Prado St (clip `0020` at ~66 ft AGL, clip
`0022` at ~159 ft AGL) and asked a direct question: does this constitute a valid
photogrammetric grid, or is there a reason the passes don't match up — and if so, "we need
something to just say it didn't happen." A visual "looks like heavy overlap" read of a
flight-log map isn't a real answer to that. This component is the "internal viewing and
judging" toolset the operator asked for: a real, computed verdict instead of a guess.

**Market check (done before building):** no standalone, lightweight overlap-checker exists
that works from a raw GPS track/flight log alone — WebODM and Pix4D both only produce a
coverage/quality report *after* a full (hours-long) reconstruction run, and there's no
pre-flight or post-flight-log-only equivalent to piggyback on. Building this was the right
call, not a reflex.

## Real-world validation — the actual Prado flight-2 telemetry

This isn't a hypothetical. The sample data shipped with this component IS the operator's
real flight-2 GPS/altitude track (extracted via `exiftool -ee -n -AbsoluteAltitude
-GPSLatitude -GPSLongitude` from the DJI Mini 5 Pro's embedded `djmd` MP4 metadata track —
see `/pipeline/README.md` for that extraction step), used with the operator's **explicit
permission** ("that is my property data, that is fine" — full release rights, unlike the
separate real-estate-shoot photos covered by CLAUDE.md's stricter release-forms rule).

Running the real telemetry through this component's logic gives:

- **Low pass (`0020`, ~66 ft / 20 m AGL):** 3 detected lawnmower legs, side overlap of
  **74.1%** and **64.6%**. The second figure is a hair under the 65%-industry-floor default
  — a genuine borderline case (well within the horizontal-FOV estimate's own margin of
  error), not a clean pass. The tool reports this honestly as `grid-insufficient-overlap`
  rather than rounding up.
- **High pass (`0022`, ~159 ft / 48 m AGL):** 1 detected leg (a single line, not a grid) —
  but its estimated ground footprint (~72 m) comfortably exceeds the property's real short
  dimension (~20 m, itself the low pass's own cross-track extent), so a single line is
  legitimately sufficient coverage at that altitude. Verdict: `single-pass-covers-target`.

**Bottom line for the real flight:** photogrammetrically sound. The one real risk both the
operator's own flight notes and this analysis agree on is canopy occlusion from the
property's large tree — a coverage gap no flight geometry fixes, not a grid-validity
problem.

## The data types — `lib/flight-coverage-types.ts`

```ts
export interface FlightTelemetryPoint {
  timestampMs: number;
  lat: number;
  lon: number;
  /** absolute/MSL altitude in meters -- the only altitude field the Mini 5
   *  Pro's embedded track actually carries (no barometric-relative field). */
  altitudeMeters: number;
}

export interface FlightPass {
  id: string;
  label: string;
  points: FlightTelemetryPoint[];
}

export interface CoverageAnalysisOptions {
  groundRefMeters: number;
  horizontalFovDeg?: number;   // default 73 -- DOCUMENTED ASSUMPTION, see below
  minSideOverlapPct?: number;  // default 65
  targetWidthMeters?: number;  // single-line passes only; omit -> "inconclusive"
}
```

This component consumes **already-extracted** telemetry — it does not parse video or run
`exiftool` itself. Raw-footage extraction is a real, non-trivial dependency (`exiftool`,
CLI/subprocess work) that belongs in `/pipeline` (documentation-only today, matching the
existing WebODM-mapping precedent in `/pipeline/README.md`), never in the bundle.

## The horizontal-FOV assumption (read before trusting a verdict)

Ground footprint width is estimated from altitude and the DJI Mini 5 Pro's wide-camera
horizontal FOV — a value not directly embedded in the telemetry track, so it's a
**documented, overridable assumption** (`horizontalFovDeg`, default 73°, the commonly cited
figure for the Mini 5 Pro's ~24mm-equivalent wide lens), not a measured constant. A verdict
that lands within a percentage point or two of a threshold (like the real 64.6%-vs-65% low
pass above) should be read as "borderline, worth a second look" — not a hard fail. Pass a
real value if you have exact camera specs for a different drone.

## Verdict logic — `lib/flight-coverage.ts`'s `analyzeFlightPass()`

Pure function, no I/O:

1. **Project lat/lon to local ENU meters** (equirectangular approximation, fine at
   single-property scale).
2. **Detect legs** — split the track on heading reversals (a real lawnmower grid line ends
   where the drone turns > ~70° to start the next line). 1 leg = a single pass; 2+ legs = a
   candidate grid.
3. **2+ legs → grid path.** Compute each leg's perpendicular offset from the first leg's
   line, derive inter-leg spacing, estimate footprint width from mean AGL, and compute
   side-overlap % per adjacent pair. Verdict is `grid-ok` if the *worst* pair clears
   `minSideOverlapPct`, else `grid-insufficient-overlap` — the conservative floor is what
   flags "may not match up."
4. **1 leg → single-pass path.** Without a `targetWidthMeters`, the verdict is
   `single-pass-inconclusive` (a real "can't judge this without more info" answer, not a
   guessed pass/fail). With one supplied, footprint-vs-target directly decides
   `single-pass-covers-target` or `single-pass-insufficient-target`.
5. **No points → `no-data`.**

## The component — presentational only

`<FlightCoverageAnalyzer passes={...} options={...} />` renders one card per pass: a
green/amber/red verdict badge, a top-down SVG plot of the detected legs (so "internal
viewing" is literal, not just a table of numbers), mean AGL, leg count, estimated footprint
width, and per-leg-pair overlap %, plus a legend explaining the three verdict colors. All
math happens in `analyzeFlightPass()`; the component is a pure renderer of its output — no
fetch, no upload, no auth, matching every other component's scope-boundary discipline (see
CLAUDE.md's "Scope boundary" section).

## What this deliberately does NOT do

- **No raw-video/telemetry parsing.** That's `/pipeline`'s job (documentation-only today).
- **No property-boundary inference.** `targetWidthMeters` is caller-supplied (e.g. from a
  real parcel boundary, or left `undefined` for an honest "inconclusive" rather than a
  guessed verdict).
- **No forward-overlap (along-track) calculation.** Continuous 4K/60fps video sampled at
  even 1fps for photogrammetry already gives near-total forward overlap by construction of
  a continuous flight at any reasonable speed — side overlap between distinct lines is the
  real failure mode this tool targets, per the operator's own question ("if there is a
  reason they don't match up").
- **No real ODM/Pix4D run.** This is a pre-reconstruction sanity check, not a replacement
  for actually running the photogrammetry pipeline — see `/pipeline/README.md`.

## Sample data — `public/flight-coverage-samples/2806-prado-flight2/`

`low-pass.json` (797 real telemetry points, clip `0020`), `high-pass.json` (254 real
points, clip `0022`), and `manifest.json` (provenance note). Full resolution, not
subsampled — an earlier subsampled version of this same data merged two of the low pass's
3 real legs into 2 in leg-detection, silently changing the computed verdict. Full-resolution
telemetry is what the real extraction pipeline produces anyway, so this is also the
representative case for a real consumer, not just a demo-accuracy nicety.
