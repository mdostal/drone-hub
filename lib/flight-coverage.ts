import type {
  CoverageAnalysisOptions,
  EnuPoint,
  FlightPass,
  PassAnalysis,
  PassVerdict,
} from "./flight-coverage-types";

// Pure flight-coverage analysis — no I/O, no video/telemetry parsing (that's
// /pipeline's job; see /pipeline/README.md). Ported from a Python prototype
// validated directly against real Prado flight-2 GPS telemetry (clips 0020 @
// ~66ft AGL and 0022 @ ~159ft AGL) — see docs/components/
// flight-coverage-analyzer.md for the full write-up of that validation run.

const DEFAULT_HORIZONTAL_FOV_DEG = 73;
const DEFAULT_MIN_SIDE_OVERLAP_PCT = 65;
const METERS_PER_DEG_LAT = 111_320;
const STATIONARY_SAMPLE_THRESHOLD_M = 0.05;
/** cosine of the direction-change angle between consecutive movement vectors
 *  below which we call it a new leg (a turn of more than ~70deg). */
const LEG_TURN_COS_THRESHOLD = 0.3;
const MIN_POINTS_PER_LEG = 3;

function toEnuMeters(points: FlightPass["points"]): EnuPoint[] {
  const lat0 = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
  const lon0 = points.reduce((sum, p) => sum + p.lon, 0) / points.length;
  const metersPerDegLon = METERS_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180);
  return points.map((p) => ({
    x: (p.lon - lon0) * metersPerDegLon,
    y: (p.lat - lat0) * METERS_PER_DEG_LAT,
  }));
}

function detectLegs(enu: EnuPoint[]): EnuPoint[][] {
  if (enu.length === 0) return [];
  const legs: EnuPoint[][] = [[enu[0]]];
  let prevVec: { dx: number; dy: number } | null = null;

  for (let i = 1; i < enu.length; i++) {
    const dx = enu[i].x - enu[i - 1].x;
    const dy = enu[i].y - enu[i - 1].y;
    const dist = Math.hypot(dx, dy);
    if (dist < STATIONARY_SAMPLE_THRESHOLD_M) {
      legs[legs.length - 1].push(enu[i]);
      continue;
    }
    if (prevVec) {
      const dot = prevVec.dx * dx + prevVec.dy * dy;
      const mag = Math.hypot(prevVec.dx, prevVec.dy) * Math.hypot(dx, dy);
      const cosAngle = mag > 0 ? dot / mag : 1;
      if (cosAngle < LEG_TURN_COS_THRESHOLD) {
        legs.push([]);
      }
    }
    legs[legs.length - 1].push(enu[i]);
    prevVec = { dx, dy };
  }

  return legs.filter((leg) => leg.length >= MIN_POINTS_PER_LEG);
}

function legBearing(leg: EnuPoint[]): number {
  const first = leg[0];
  const last = leg[leg.length - 1];
  return Math.atan2(last.x - first.x, last.y - first.y);
}

function perpendicularOffset(leg: EnuPoint[], refPoint: EnuPoint, refBearing: number): number {
  const mx = leg.reduce((sum, p) => sum + p.x, 0) / leg.length;
  const my = leg.reduce((sum, p) => sum + p.y, 0) / leg.length;
  const dx = mx - refPoint.x;
  const dy = my - refPoint.y;
  const perpX = Math.cos(refBearing);
  const perpY = -Math.sin(refBearing);
  return dx * perpX + dy * perpY;
}

function computeVerdict(
  legCount: number,
  sideOverlapPct: number[],
  minSideOverlapPct: number,
  footprintWidthMeters: number,
  targetWidthMeters: number | undefined,
): { verdict: PassVerdict; verdictReason: string } {
  if (legCount === 0) {
    return { verdict: "no-data", verdictReason: "No usable telemetry points for this pass." };
  }

  if (legCount >= 2) {
    const worst = Math.min(...sideOverlapPct);
    if (worst >= minSideOverlapPct) {
      return {
        verdict: "grid-ok",
        verdictReason: `${legCount}-line grid with ${worst.toFixed(0)}% minimum side overlap (>= ${minSideOverlapPct}% target).`,
      };
    }
    return {
      verdict: "grid-insufficient-overlap",
      verdictReason: `${legCount}-line grid but minimum side overlap is only ${worst.toFixed(0)}% (< ${minSideOverlapPct}% target) — adjacent lines may not photogrammetrically match up.`,
    };
  }

  // Single leg.
  if (targetWidthMeters == null) {
    return {
      verdict: "single-pass-inconclusive",
      verdictReason: `Single line, footprint ~${footprintWidthMeters.toFixed(0)}m wide — cannot confirm full coverage without a target width (e.g. the property's short dimension).`,
    };
  }
  if (footprintWidthMeters >= targetWidthMeters) {
    return {
      verdict: "single-pass-covers-target",
      verdictReason: `Single line, but footprint (~${footprintWidthMeters.toFixed(0)}m) already exceeds the target width (${targetWidthMeters.toFixed(0)}m) — full coverage without needing multiple lines.`,
    };
  }
  return {
    verdict: "single-pass-insufficient-target",
    verdictReason: `Single line, footprint (~${footprintWidthMeters.toFixed(0)}m) is narrower than the target width (${targetWidthMeters.toFixed(0)}m) — this pass alone does not cover the target.`,
  };
}

/** Analyze one flight pass's telemetry for photogrammetric grid validity. */
export function analyzeFlightPass(pass: FlightPass, opts: CoverageAnalysisOptions): PassAnalysis {
  const horizontalFovDeg = opts.horizontalFovDeg ?? DEFAULT_HORIZONTAL_FOV_DEG;
  const minSideOverlapPct = opts.minSideOverlapPct ?? DEFAULT_MIN_SIDE_OVERLAP_PCT;

  if (pass.points.length === 0) {
    return {
      passId: pass.id,
      label: pass.label,
      pointCount: 0,
      meanAglMeters: 0,
      boundingBoxMeters: { east: 0, north: 0 },
      legs: [],
      legSpacingsMeters: [],
      estFootprintWidthMeters: 0,
      sideOverlapPct: [],
      verdict: "no-data",
      verdictReason: "No telemetry points supplied for this pass.",
    };
  }

  const meanAbsoluteAltitude =
    pass.points.reduce((sum, p) => sum + p.altitudeMeters, 0) / pass.points.length;
  const meanAglMeters = meanAbsoluteAltitude - opts.groundRefMeters;

  const enu = toEnuMeters(pass.points);
  const xs = enu.map((p) => p.x);
  const ys = enu.map((p) => p.y);
  const boundingBoxMeters = {
    east: Math.max(...xs) - Math.min(...xs),
    north: Math.max(...ys) - Math.min(...ys),
  };

  const legs = detectLegs(enu);
  const estFootprintWidthMeters = 2 * meanAglMeters * Math.tan((horizontalFovDeg / 2) * (Math.PI / 180));

  let legSpacingsMeters: number[] = [];
  let sideOverlapPct: number[] = [];
  if (legs.length >= 2) {
    const refBearing = legBearing(legs[0]);
    const refPoint = legs[0][0];
    const offsets = legs
      .map((leg) => perpendicularOffset(leg, refPoint, refBearing))
      .sort((a, b) => a - b);
    legSpacingsMeters = offsets.slice(1).map((v, i) => v - offsets[i]);
    sideOverlapPct = legSpacingsMeters.map((s) =>
      Math.max(0, (1 - s / estFootprintWidthMeters) * 100),
    );
  }

  const { verdict, verdictReason } = computeVerdict(
    legs.length,
    sideOverlapPct,
    minSideOverlapPct,
    estFootprintWidthMeters,
    opts.targetWidthMeters,
  );

  return {
    passId: pass.id,
    label: pass.label,
    pointCount: pass.points.length,
    meanAglMeters,
    boundingBoxMeters,
    legs,
    legSpacingsMeters,
    estFootprintWidthMeters,
    sideOverlapPct,
    verdict,
    verdictReason,
  };
}
