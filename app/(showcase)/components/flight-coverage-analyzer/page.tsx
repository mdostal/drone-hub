// Public showcase page for <FlightCoverageAnalyzer>. This whole repo
// carries no gating of any kind (see CLAUDE.md's "Scope boundary" section).
//
// Sample data is REAL flight telemetry from 2806 Prado St (the operator's
// own property), not synthetic — used with the operator's explicit
// permission (full release rights to this property's data; see
// public/flight-coverage-samples/2806-prado-flight2/manifest.json's
// provenance note and docs/components/flight-coverage-analyzer.md).
import { ComponentShowcase } from "@/components/showcase";
import { FlightCoverageAnalyzer } from "@/components/FlightCoverageAnalyzer";
import type { FlightPass } from "@/components/FlightCoverageAnalyzer";
import lowPass from "@/public/flight-coverage-samples/2806-prado-flight2/low-pass.json";
import highPass from "@/public/flight-coverage-samples/2806-prado-flight2/high-pass.json";

const SAMPLE_PASSES: FlightPass[] = [lowPass, highPass];

// The property's real short-dimension (~20m), itself derived from the low
// pass's own cross-track footprint — supplied here so the single-line high
// pass gets a real coverage verdict instead of "inconclusive".
const TARGET_WIDTH_METERS = 20;

const USAGE_CODE = `import { FlightCoverageAnalyzer } from "@/components/FlightCoverageAnalyzer";
import type { FlightPass } from "@/components/FlightCoverageAnalyzer";

const passes: FlightPass[] = [
  { id: "0020", label: "Low pass", points: [{ timestampMs: 0, lat: 30.26, lon: -97.71, altitudeMeters: 156 }, /* ... */] },
];

<FlightCoverageAnalyzer
  passes={passes}
  options={{ groundRefMeters: 136.35, targetWidthMeters: 20 }}
/>`;

export default function FlightCoverageAnalyzerShowcasePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 p-8">
      <ComponentShowcase
        title="FlightCoverageAnalyzer"
        description="Judges whether nadir drone passes constitute a photogrammetrically valid capture — a real multi-line grid with adequate side overlap, or a single wide-altitude pass whose footprint covers the target — with a green/amber/red verdict instead of eyeballing a flight map."
        demo={
          <FlightCoverageAnalyzer
            passes={SAMPLE_PASSES}
            options={{ groundRefMeters: 136.35, targetWidthMeters: TARGET_WIDTH_METERS }}
          />
        }
        code={USAGE_CODE}
      />
    </main>
  );
}
