// Public export surface for <FlightCoverageAnalyzer> — import from
// "@/components/FlightCoverageAnalyzer" (or copy this folder + lib/
// flight-coverage.ts + lib/flight-coverage-types.ts into a standalone
// consumer — everything it transitively imports is scoped to those files,
// no app/ or gating deps, no network/storage/auth logic of any kind).
export { FlightCoverageAnalyzer } from "./FlightCoverageAnalyzer";
export type { FlightCoverageAnalyzerProps } from "./FlightCoverageAnalyzer";

export { analyzeFlightPass } from "@/lib/flight-coverage";
export type {
  CoverageAnalysisOptions,
  FlightPass,
  FlightTelemetryPoint,
  PassAnalysis,
  PassVerdict,
} from "@/lib/flight-coverage-types";
