// Unit specs for <Model3D>'s pure logic — NOT a full-component render test.
//
// Confirmed while scoping this suite (same exercise as
// components/LayerViewer/LayerViewer.test.tsx's header comment): unlike
// LayerViewer, Model3D.tsx has very little to extract. Its body is:
//   - <GltfScene>          — calls drei's useGLTF(url), a WebGL/Suspense hook.
//   - <LoadingPlaceholder> — r3f JSX (<mesh>/<boxGeometry>/...), only valid
//                            inside a <Canvas>'s r3f render tree.
//   - <ModelErrorBoundary> — a React error boundary; its lifecycle methods
//                            are framework plumbing, not business logic.
//   - <Model3D>            — composes <Canvas>/<Bounds>/<OrbitControls>,
//                            all of which touch a real WebGL context the
//                            moment they mount. jsdom doesn't implement
//                            WebGL, so rendering any of this throws.
//   - `ModelDef`            — a 3-field interface (id/url/title), fully
//                            checked by TypeScript at compile time; there is
//                            no runtime validation in this file to extract
//                            (unlike, say, LayerViewer's manifest-resolving
//                            fetch logic).
//
// The one genuinely pure, WebGL-independent piece was the duplicated
// "turn whatever got thrown into a display string" logic inside
// ModelErrorBoundary's getDerivedStateFromError/componentDidCatch — pulled
// out as `toErrorMessage` (see Model3D.tsx) both to de-duplicate it and to
// make it exercisable here. That's it; everything else in this component
// stays covered by a live/manual WebGL check only (same precedent as
// LayerViewer's addLayerToMap/updateLayerOnMap staying Playwright-only).
import { describe, expect, it } from "vitest";
import { distanceBetweenPoints, formatDistance, toErrorMessage } from "./Model3D";

describe("toErrorMessage", () => {
  it("returns an Error's own .message", () => {
    expect(toErrorMessage(new Error("failed to fetch model.glb: 404"))).toBe(
      "failed to fetch model.glb: 404",
    );
  });

  it("stringifies a thrown string as-is", () => {
    expect(toErrorMessage("boom")).toBe("boom");
  });

  it("stringifies a thrown non-Error object via String()", () => {
    expect(toErrorMessage({ code: 500 })).toBe("[object Object]");
  });

  it("stringifies a thrown number/other primitive", () => {
    expect(toErrorMessage(404)).toBe("404");
    expect(toErrorMessage(null)).toBe("null");
    expect(toErrorMessage(undefined)).toBe("undefined");
  });

  it("prefers a subclassed Error's .message over its String() form", () => {
    class GltfParseError extends Error {
      constructor(message: string) {
        super(message);
        this.name = "GltfParseError";
      }
    }
    const err = new GltfParseError("malformed glTF: missing 'asset' field");
    expect(toErrorMessage(err)).toBe("malformed glTF: missing 'asset' field");
    // Sanity check this actually distinguishes from the naive String(err)
    // path (which would include the "GltfParseError: " name prefix) —
    // proves the `instanceof Error` branch, not the fallback, is firing.
    expect(toErrorMessage(err)).not.toBe(String(err));
  });
});

// Unit specs for the measure tool's pure math — model3d-measure-tool-and-
// legend story. Same jsdom-testability precedent as toErrorMessage above:
// pulled out of the WebGL-only component so the actual arithmetic (not just
// "does three.js render") is directly, cheaply verifiable. Live click/drag/
// <Bounds>-non-re-frame behavior is verified separately via Playwright, per
// the story's acceptance criteria (a pure unit test can't exercise that).
describe("distanceBetweenPoints", () => {
  it("computes the correct Euclidean distance between two known 3D points", () => {
    // A 3-4-12 right "cone" — dx=3, dy=4, dz=12 → sqrt(9+16+144) = sqrt(169) = 13.
    expect(distanceBetweenPoints({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 12 })).toBe(13);
  });

  it("returns 0 for two identical points", () => {
    expect(distanceBetweenPoints({ x: 5, y: -2, z: 7 }, { x: 5, y: -2, z: 7 })).toBe(0);
  });

  it("is symmetric (order of points doesn't matter)", () => {
    const a = { x: 1, y: 2, z: 3 };
    const b = { x: -4, y: 8, z: 0.5 };
    expect(distanceBetweenPoints(a, b)).toBeCloseTo(distanceBetweenPoints(b, a));
  });

  it("handles simple 2D-plane (z=0) distances", () => {
    // Classic 3-4-5 triangle in the XY plane.
    expect(distanceBetweenPoints({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 })).toBe(5);
  });
});

describe("formatDistance", () => {
  it("labels the distance in raw 'units' when no unitsPerMeter hint is given", () => {
    expect(formatDistance(13)).toBe("13.00 units");
  });

  it("still labels in 'units' when unitsPerMeter is explicitly undefined", () => {
    expect(formatDistance(4.5, undefined)).toBe("4.50 units");
  });

  it("converts to meters when a positive unitsPerMeter scale hint is provided", () => {
    // 100 raw glTF units, 50 units per real-world meter → 2.00 m.
    expect(formatDistance(100, 50)).toBe("2.00 m");
  });

  it("never fabricates a 'meters' label from a zero or negative scale hint", () => {
    expect(formatDistance(13, 0)).toBe("13.00 units");
    expect(formatDistance(13, -5)).toBe("13.00 units");
  });
});
