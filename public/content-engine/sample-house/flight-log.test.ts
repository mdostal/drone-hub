import { describe, expect, it } from "vitest";
import type { FlightLogEntry } from "@/lib/flight-log-types";
import flightLogJson from "./flight-log.json";

// Verification for the minecraft-content-engine-data story. Kept (not
// throwaway) so it re-runs under `npm run test` and catches drift if the
// sample flight log or lib/flight-log-types.ts's shape ever changes.
//
// Two things this asserts, matching the story's acceptance criteria:
//  1. flight-log.json type-checks against FlightLogEntry[] with EXACTLY the
//     four fields {timestampMs, lat, lon, altitudeMeters} — no more, no
//     less (a runtime key-count check, since a JS object with extra fields
//     still structurally satisfies a TS interface with fewer required
//     fields — the interface itself not growing extra fields is covered by
//     the sibling `it("FlightLogEntry has exactly the four expected keys"...)`
//     compile-time check below).
//  2. the sample reads as a smooth, plausible short flight (small,
//     consistent consecutive deltas), not random noise.

function assertFlightLogEntry(x: unknown, index: number): asserts x is FlightLogEntry {
  expect(x, `flight-log[${index}] should be an object`).toBeTypeOf("object");
  const row = x as Record<string, unknown>;
  const keys = Object.keys(row).sort();
  expect(keys, `flight-log[${index}] should have exactly the four FlightLogEntry fields`).toEqual(
    ["altitudeMeters", "lat", "lon", "timestampMs"],
  );
  expect(typeof row.timestampMs, `flight-log[${index}].timestampMs`).toBe("number");
  expect(typeof row.lat, `flight-log[${index}].lat`).toBe("number");
  expect(typeof row.lon, `flight-log[${index}].lon`).toBe("number");
  expect(typeof row.altitudeMeters, `flight-log[${index}].altitudeMeters`).toBe("number");
}

function assertFlightLog(x: unknown): asserts x is FlightLogEntry[] {
  expect(Array.isArray(x)).toBe(true);
  (x as unknown[]).forEach((row, i) => assertFlightLogEntry(row, i));
}

describe("sample-house flight-log.json", () => {
  it("type-checks as FlightLogEntry[] with no errors, and rows have exactly the four expected fields", () => {
    const raw: unknown = flightLogJson;
    assertFlightLog(raw);
    const log: FlightLogEntry[] = raw; // narrowed by the assertion above, no cast needed
    expect(log.length).toBeGreaterThanOrEqual(10);
    expect(log.length).toBeLessThanOrEqual(20);
  });

  it("compile-time: FlightLogEntry has exactly the four expected keys (no gimbal/orientation fields)", () => {
    // Exercised at `tsc`/`npm run build` time, not at runtime: if
    // lib/flight-log-types.ts's FlightLogEntry ever grows an extra required
    // field, `full` below fails to satisfy the type; if it grows an extra
    // OPTIONAL field, this compile-time check can't catch that (TS
    // structural typing allows omitting optional fields) but the sibling
    // runtime `keys` check above still catches optional fields with values
    // actually present in the sample data.
    const full: FlightLogEntry = { timestampMs: 0, lat: 0, lon: 0, altitudeMeters: 0 };
    expect(Object.keys(full).sort()).toEqual(["altitudeMeters", "lat", "lon", "timestampMs"]);
  });

  it("has a plausible, smoothly-varying flight path — not random jumps", () => {
    const log = flightLogJson as FlightLogEntry[];

    // Timestamps increment steadily (200-500ms per row, per the story spec).
    for (let i = 1; i < log.length; i++) {
      const dt = log[i].timestampMs - log[i - 1].timestampMs;
      expect(dt, `timestampMs gap at row ${i}`).toBeGreaterThanOrEqual(200);
      expect(dt, `timestampMs gap at row ${i}`).toBeLessThanOrEqual(500);
    }

    // lat/lon drift by small, consistent deltas (a short survey-line flight
    // path, not GPS noise/random teleporting). ~6-7m of drift per sample at
    // this latitude corresponds to roughly 0.0001 degrees; allow headroom.
    const MAX_LATLON_DELTA_DEG = 0.001;
    for (let i = 1; i < log.length; i++) {
      const dLat = Math.abs(log[i].lat - log[i - 1].lat);
      const dLon = Math.abs(log[i].lon - log[i - 1].lon);
      expect(dLat, `lat delta at row ${i}`).toBeLessThan(MAX_LATLON_DELTA_DEG);
      expect(dLon, `lon delta at row ${i}`).toBeLessThan(MAX_LATLON_DELTA_DEG);
    }

    // altitude rises/falls plausibly (a takeoff ramp / cruise / descent) —
    // consecutive altitude deltas stay small (no sudden teleports), and the
    // overall shape climbs from ~ground level then returns near ground.
    const MAX_ALTITUDE_DELTA_M = 15;
    for (let i = 1; i < log.length; i++) {
      const dAlt = Math.abs(log[i].altitudeMeters - log[i - 1].altitudeMeters);
      expect(dAlt, `altitude delta at row ${i}`).toBeLessThan(MAX_ALTITUDE_DELTA_M);
    }
    expect(log[0].altitudeMeters, "starts near ground level").toBeLessThan(5);
    expect(log[log.length - 1].altitudeMeters, "ends near ground level").toBeLessThan(5);
    const maxAltitude = Math.max(...log.map((r) => r.altitudeMeters));
    expect(maxAltitude, "reaches a real cruise altitude").toBeGreaterThan(20);
  });

  it("lat/lon drift is directionally consistent (monotonic), not oscillating noise", () => {
    const log = flightLogJson as FlightLogEntry[];
    const latDiffs = log.slice(1).map((row, i) => row.lat - log[i].lat);
    const lonDiffs = log.slice(1).map((row, i) => row.lon - log[i].lon);
    expect(latDiffs.every((d) => d > 0), "lat drifts monotonically in one direction").toBe(true);
    expect(lonDiffs.every((d) => d > 0), "lon drifts monotonically in one direction").toBe(true);
  });
});
