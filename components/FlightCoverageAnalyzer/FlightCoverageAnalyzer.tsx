import { analyzeFlightPass } from "@/lib/flight-coverage";
import type { CoverageAnalysisOptions, EnuPoint, FlightPass, PassAnalysis, PassVerdict } from "@/lib/flight-coverage-types";

/**
 * <FlightCoverageAnalyzer> — judges whether a set of nadir drone passes
 * (GPS+altitude telemetry) is a photogrammetrically valid capture: a real
 * multi-line grid with adequate side overlap, or a single wide-altitude
 * pass whose footprint alone covers the target — vs a pass that genuinely
 * doesn't. See docs/components/flight-coverage-analyzer.md for the full
 * methodology, the horizontal-FOV assumption, and provenance of the real
 * sample data (an actual property's flight, used with the operator's
 * explicit permission).
 *
 * Pure/presentational: `analyzeFlightPass` (lib/flight-coverage.ts) does
 * all the math; this component only renders its output plus a top-down SVG
 * plot of the detected flight legs. No fetch/upload — telemetry arrives via
 * props, already extracted (see /pipeline/README.md for the real
 * exiftool extraction step, which lives outside the bundle).
 */
export interface FlightCoverageAnalyzerProps {
  passes: FlightPass[];
  options: CoverageAnalysisOptions;
  className?: string;
}

const VERDICT_META: Record<PassVerdict, { text: string; dotClassName: string; textClassName: string }> = {
  "grid-ok": { text: "Grid OK", dotClassName: "bg-green-500", textClassName: "text-green-600 dark:text-green-400" },
  "single-pass-covers-target": {
    text: "Covers target",
    dotClassName: "bg-green-500",
    textClassName: "text-green-600 dark:text-green-400",
  },
  "grid-insufficient-overlap": {
    text: "Insufficient overlap",
    dotClassName: "bg-red-500",
    textClassName: "text-red-600 dark:text-red-400",
  },
  "single-pass-insufficient-target": {
    text: "Does not cover target",
    dotClassName: "bg-red-500",
    textClassName: "text-red-600 dark:text-red-400",
  },
  "single-pass-inconclusive": {
    text: "Inconclusive",
    dotClassName: "bg-amber-500",
    textClassName: "text-amber-600 dark:text-amber-400",
  },
  "no-data": { text: "No data", dotClassName: "bg-muted", textClassName: "text-muted" },
};

function LegsPlot({ legs }: { legs: EnuPoint[][] }) {
  const allPoints = legs.flat();
  if (allPoints.length === 0) return null;

  const xs = allPoints.map((p) => p.x);
  const ys = allPoints.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const padding = Math.max(1, (maxX - minX) * 0.1, (maxY - minY) * 0.1);
  const width = maxX - minX + padding * 2 || 1;
  const height = maxY - minY + padding * 2 || 1;

  // SVG y-axis grows downward; flip north (y) so the plot reads map-like.
  const toSvg = (p: EnuPoint) => ({
    x: p.x - minX + padding,
    y: height - (p.y - minY + padding),
  });

  const colors = ["#e8590c", "#0ea5e9", "#22c55e", "#a855f7", "#eab308"];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-40 w-full rounded-lg border border-border bg-background" role="img" aria-label={`Top-down plot of ${legs.length} detected flight leg(s)`}>
      {legs.map((leg, i) => {
        const pts = leg.map(toSvg);
        const d = pts.map((p, j) => `${j === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
        return <path key={i} d={d} fill="none" stroke={colors[i % colors.length]} strokeWidth={Math.max(width, height) * 0.01} strokeLinecap="round" />;
      })}
    </svg>
  );
}

function PassCard({ analysis }: { analysis: PassAnalysis }) {
  const meta = VERDICT_META[analysis.verdict];
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-sm font-medium text-foreground">{analysis.label}</span>
          <span className="text-xs text-muted">clip {analysis.passId}</span>
        </div>
        <div className="flex items-center gap-1.5" role="status" aria-label={meta.text}>
          <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${meta.dotClassName}`} />
          <span className={`text-sm font-medium ${meta.textClassName}`}>{meta.text}</span>
        </div>
      </div>

      <LegsPlot legs={analysis.legs} />

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <dt className="text-muted">Mean AGL</dt>
        <dd className="text-foreground">{analysis.meanAglMeters.toFixed(1)} m</dd>
        <dt className="text-muted">Detected legs</dt>
        <dd className="text-foreground">{analysis.legs.length}</dd>
        <dt className="text-muted">Est. footprint width</dt>
        <dd className="text-foreground">{analysis.estFootprintWidthMeters.toFixed(1)} m</dd>
        {analysis.sideOverlapPct.length > 0 && (
          <>
            <dt className="text-muted">Side overlap</dt>
            <dd className="text-foreground">{analysis.sideOverlapPct.map((p) => `${p.toFixed(0)}%`).join(", ")}</dd>
          </>
        )}
      </dl>

      <p className="text-xs text-muted">{analysis.verdictReason}</p>
    </div>
  );
}

export function FlightCoverageAnalyzer({ passes, options, className }: FlightCoverageAnalyzerProps) {
  const analyses = passes.map((pass) => analyzeFlightPass(pass, options));

  return (
    <div className={["flex flex-col gap-4", className].filter(Boolean).join(" ")}>
      <div className="grid gap-4 sm:grid-cols-2">
        {analyses.map((analysis) => (
          <PassCard key={analysis.passId} analysis={analysis} />
        ))}
      </div>

      <div className="rounded-xl border border-border bg-surface p-3 text-xs text-muted">
        <p className="mb-1.5 font-medium text-foreground">Legend</p>
        <ul className="flex flex-col gap-1">
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full bg-green-500" /> Valid coverage — grid
            side-overlap meets the target, or a single pass whose footprint already covers the target width.
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" /> Insufficient — adjacent
            lines may not photogrammetrically match up, or a single pass doesn&apos;t reach the target width.
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500" /> Inconclusive — a single
            line with no target width supplied to check against.
          </li>
        </ul>
      </div>
    </div>
  );
}
