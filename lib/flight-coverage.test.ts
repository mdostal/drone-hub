import { describe, expect, it } from "vitest";
import { analyzeFlightPass } from "./flight-coverage";
import type { FlightPass, FlightTelemetryPoint } from "./flight-coverage-types";
import lowPassFixture from "../public/flight-coverage-samples/2806-prado-flight2/low-pass.json";
import highPassFixture from "../public/flight-coverage-samples/2806-prado-flight2/high-pass.json";

const GROUND_REF_M = 136.35;

// Synthetic helpers for controlled edge cases (real-telemetry validation
// against the actual Prado flight-2 sample data is below).
function line(latStart: number, lonStart: number, latEnd: number, lonEnd: number, altMeters: number, n = 20): FlightTelemetryPoint[] {
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    return {
      timestampMs: i * 100,
      lat: latStart + (latEnd - latStart) * t,
      lon: lonStart + (lonEnd - lonStart) * t,
      altitudeMeters: altMeters,
    };
  });
}

describe("analyzeFlightPass", () => {
  it("returns no-data for an empty pass", () => {
    const pass: FlightPass = { id: "empty", label: "empty", points: [] };
    const result = analyzeFlightPass(pass, { groundRefMeters: 0 });
    expect(result.verdict).toBe("no-data");
    expect(result.legs).toHaveLength(0);
  });

  it("detects a single leg with no target width as inconclusive", () => {
    const pass: FlightPass = {
      id: "single",
      label: "single line",
      points: line(30.0, -97.0, 30.0005, -97.0, 150),
    };
    const result = analyzeFlightPass(pass, { groundRefMeters: 130 });
    expect(result.legs).toHaveLength(1);
    expect(result.verdict).toBe("single-pass-inconclusive");
  });

  it("judges a single wide-altitude pass as covering a small target", () => {
    const pass: FlightPass = {
      id: "high",
      label: "high overview",
      points: line(30.0, -97.0, 30.0005, -97.0, 200),
    };
    // At 200 - 130 = 70m AGL with a 73deg FOV, footprint is well over 100m —
    // easily exceeds a tiny 10m target.
    const result = analyzeFlightPass(pass, { groundRefMeters: 130, targetWidthMeters: 10 });
    expect(result.verdict).toBe("single-pass-covers-target");
  });

  it("judges a single low-altitude pass as NOT covering a large target", () => {
    const pass: FlightPass = {
      id: "low-narrow",
      label: "low narrow pass",
      points: line(30.0, -97.0, 30.0002, -97.0, 132, 10),
    };
    // ~1.65m AGL -> tiny footprint, target is 200m -- should fail outright.
    const result = analyzeFlightPass(pass, { groundRefMeters: 130.35, targetWidthMeters: 200 });
    expect(result.verdict).toBe("single-pass-insufficient-target");
  });

  it("detects a real multi-line grid with adequate side overlap from two adjacent, offset lines", () => {
    // Two parallel N-S lines ~8m apart at 20m AGL (footprint ~29m wide at 73deg FOV)
    // -> side overlap should be well over 65%.
    const legA = line(30.0, -97.0, 30.0004, -97.0, 150);
    const legB = line(30.0004, -97.00009, 30.0, -97.00009, 150); // offset ~8.6m east, reversed direction (real lawnmower turn)
    const pass: FlightPass = { id: "grid", label: "2-line grid", points: [...legA, ...legB] };
    const result = analyzeFlightPass(pass, { groundRefMeters: 130 });
    expect(result.legs.length).toBeGreaterThanOrEqual(2);
    expect(result.verdict).toBe("grid-ok");
    expect(result.sideOverlapPct[0]).toBeGreaterThan(65);
  });

  it("flags a multi-line grid with lines spaced too far apart", () => {
    const legA = line(30.0, -97.0, 30.0004, -97.0, 150);
    const legB = line(30.0004, -96.999, 30.0, -96.999, 150); // ~86m east -- way past footprint width
    const pass: FlightPass = { id: "bad-grid", label: "spaced-out grid", points: [...legA, ...legB] };
    const result = analyzeFlightPass(pass, { groundRefMeters: 130 });
    expect(result.legs.length).toBeGreaterThanOrEqual(2);
    expect(result.verdict).toBe("grid-insufficient-overlap");
  });

  describe("real Prado flight-2 telemetry (rights-cleared sample data)", () => {
    it("low pass (0020, ~66ft AGL): detects the real 3-line lawnmower grid, right at the overlap floor", () => {
      // Real, honest result — not fudged: the 3 detected legs give 74.1% and
      // 64.6% side overlap. 64.6% is a hair under the 65% industry-floor
      // default, so the verdict is the conservative "insufficient" call
      // rather than a clean pass — a genuine borderline case (well within
      // the horizontal-FOV assumption's own margin of error), which is
      // exactly the kind of real-world nuance this tool exists to surface
      // instead of eyeballing "looks like heavy overlap" from a flight map.
      const pass = lowPassFixture as unknown as FlightPass;
      const result = analyzeFlightPass(pass, { groundRefMeters: GROUND_REF_M });
      expect(result.meanAglMeters).toBeGreaterThan(15);
      expect(result.meanAglMeters).toBeLessThan(25);
      expect(result.legs).toHaveLength(3);
      expect(result.sideOverlapPct[0]).toBeGreaterThan(70);
      expect(result.sideOverlapPct[1]).toBeGreaterThan(60);
      expect(result.sideOverlapPct[1]).toBeLessThan(65);
      expect(result.verdict).toBe("grid-insufficient-overlap");
    });

    it("high pass (0022, ~159ft AGL): detects a single wide-footprint overview line", () => {
      const pass = highPassFixture as unknown as FlightPass;
      const result = analyzeFlightPass(pass, { groundRefMeters: GROUND_REF_M });
      expect(result.meanAglMeters).toBeGreaterThan(40);
      expect(result.legs).toHaveLength(1);
      // Footprint at this altitude comfortably exceeds the property's real
      // short dimension (~20m, from the low pass's own cross-track extent).
      expect(result.estFootprintWidthMeters).toBeGreaterThan(50);
    });

    it("high pass covers the target width derived from the low pass's own footprint", () => {
      const pass = highPassFixture as unknown as FlightPass;
      const result = analyzeFlightPass(pass, { groundRefMeters: GROUND_REF_M, targetWidthMeters: 20 });
      expect(result.verdict).toBe("single-pass-covers-target");
    });
  });
});
