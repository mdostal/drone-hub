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
import { toErrorMessage } from "./Model3D";

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
