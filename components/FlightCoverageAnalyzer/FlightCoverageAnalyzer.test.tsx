import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FlightCoverageAnalyzer } from "./FlightCoverageAnalyzer";
import type { FlightPass } from "@/lib/flight-coverage-types";

function line(latStart: number, lonStart: number, latEnd: number, lonEnd: number, altMeters: number, n = 20) {
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

describe("<FlightCoverageAnalyzer>", () => {
  it("Given passes, when rendered, then each pass gets its own card with a verdict badge", () => {
    const passes: FlightPass[] = [
      { id: "a", label: "Pass A", points: line(30, -97, 30.0005, -97, 150) },
      { id: "b", label: "Pass B", points: line(30, -97, 30.0002, -97, 132, 10) },
    ];
    render(<FlightCoverageAnalyzer passes={passes} options={{ groundRefMeters: 130 }} />);
    expect(screen.getByText("Pass A")).toBeInTheDocument();
    expect(screen.getByText("Pass B")).toBeInTheDocument();
    expect(screen.getAllByRole("status")).toHaveLength(2);
  });

  it("Given a pass with no target width, when rendered, then it shows the Inconclusive verdict", () => {
    const passes: FlightPass[] = [{ id: "single", label: "Single line", points: line(30, -97, 30.0005, -97, 150) }];
    render(<FlightCoverageAnalyzer passes={passes} options={{ groundRefMeters: 130 }} />);
    expect(screen.getByText("Inconclusive")).toBeInTheDocument();
  });

  it("Given a real multi-line grid pass, when rendered, then it plots the detected legs as an SVG", () => {
    const legA = line(30.0, -97.0, 30.0004, -97.0, 150);
    const legB = line(30.0004, -97.00009, 30.0, -97.00009, 150);
    const passes: FlightPass[] = [{ id: "grid", label: "Grid pass", points: [...legA, ...legB] }];
    render(<FlightCoverageAnalyzer passes={passes} options={{ groundRefMeters: 130 }} />);
    expect(screen.getByRole("img", { name: /top-down plot of 2 detected flight leg/i })).toBeInTheDocument();
    expect(screen.getByText("Grid OK")).toBeInTheDocument();
  });

  it("Given the component, when rendered, then a legend explaining the verdict colors is shown", () => {
    const passes: FlightPass[] = [{ id: "a", label: "Pass A", points: line(30, -97, 30.0005, -97, 150) }];
    render(<FlightCoverageAnalyzer passes={passes} options={{ groundRefMeters: 130 }} />);
    expect(screen.getByText("Legend")).toBeInTheDocument();
  });
});
