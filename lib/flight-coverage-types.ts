// Typed shapes for the flight-coverage analyzer — judges whether a set of
// nadir drone passes (GPS+altitude telemetry) constitutes a photogrammetrically
// valid capture (a real multi-line grid with adequate side overlap, or a
// single wide-altitude pass whose footprint alone covers the target), vs a
// pass that doesn't. Built against REAL DJI Mini 5 Pro telemetry shape,
// confirmed via `exiftool -ee -n -AbsoluteAltitude -GPSLatitude -GPSLongitude`
// against an actual Prado flight-2 clip — see docs/components/
// flight-coverage-analyzer.md for the full methodology and provenance.

/** One telemetry sample, already extracted from a clip's embedded GPS/altitude
 *  track (the DJI Mini 5 Pro embeds this in a proprietary `djmd` MP4 track —
 *  see /pipeline/README.md for the extraction step; this component consumes
 *  already-extracted points, it does not parse video itself). */
export interface FlightTelemetryPoint {
  /** ms from clip start. */
  timestampMs: number;
  lat: number;
  lon: number;
  /** absolute/MSL altitude in meters — the only altitude field the Mini 5
   *  Pro's embedded track actually carries (no barometric-relative field). */
  altitudeMeters: number;
}

/** One continuous flight pass (typically one video clip) at roughly one altitude. */
export interface FlightPass {
  /** stable id, e.g. a clip number like "0020". */
  id: string;
  /** human label, e.g. "Low pass — roof/lot detail". */
  label: string;
  points: FlightTelemetryPoint[];
}

export type PassVerdict =
  | "grid-ok"
  | "grid-insufficient-overlap"
  | "single-pass-covers-target"
  | "single-pass-insufficient-target"
  | "single-pass-inconclusive"
  | "no-data";

export interface EnuPoint {
  /** meters east of the pass's centroid. */
  x: number;
  /** meters north of the pass's centroid. */
  y: number;
}

export interface CoverageAnalysisOptions {
  /** ASL ground-reference elevation (meters), e.g. the flight's takeoff
   *  point / lowest recorded altitude, used to convert absolute altitude to AGL. */
  groundRefMeters: number;
  /** Camera horizontal field of view in degrees, used to estimate ground
   *  footprint width at a given AGL. Default 73° — the commonly cited
   *  horizontal FOV for the DJI Mini 5 Pro's wide (~24mm-equiv) lens. This
   *  is a DOCUMENTED ASSUMPTION, not a measured value — see the component's
   *  docs for why, and pass a real value if you have exact camera specs. */
  horizontalFovDeg?: number;
  /** Minimum side-overlap percentage for a multi-line grid to be judged
   *  adequate. Default 65 (the commonly cited photogrammetry-industry floor). */
  minSideOverlapPct?: number;
  /** For a single-line pass only: the real-world target width (meters,
   *  perpendicular to the flight line) that needs full coverage — e.g. a
   *  property's short dimension. Omit if unknown; the verdict is then
   *  "single-pass-inconclusive" rather than a guess. */
  targetWidthMeters?: number;
}

export interface PassAnalysis {
  passId: string;
  label: string;
  pointCount: number;
  meanAglMeters: number;
  /** overall GPS-track bounding box, meters. */
  boundingBoxMeters: { east: number; north: number };
  /** detected lawnmower legs (parallel straight-line runs), as ENU polylines
   *  for plotting. */
  legs: EnuPoint[][];
  /** perpendicular spacing (meters) between adjacent legs, sorted. Empty if
   *  fewer than 2 legs. */
  legSpacingsMeters: number[];
  /** estimated ground footprint width (meters) at this pass's mean AGL. */
  estFootprintWidthMeters: number;
  /** side-overlap % per adjacent leg pair (same order as legSpacingsMeters). */
  sideOverlapPct: number[];
  verdict: PassVerdict;
  /** human-readable one-line explanation of the verdict. */
  verdictReason: string;
}
