// BDD specs for <ComponentShowcase> in isolation — same RTL render pattern
// as components/LayerViewer/LayerControl.test.tsx (a plain, presentational
// DOM component, safe to fully render). Covers
// model3d-showcase-shell.yaml's acceptance criterion: "Given
// <ComponentShowcase title description demo code />, when rendered, then
// all four render in a consistent layout."
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ComponentShowcase } from "./ComponentShowcase";

describe("<ComponentShowcase>", () => {
  it("renders the title, description, demo slot, and code slot together", () => {
    render(
      <ComponentShowcase
        title="LayerViewer"
        description="Toggleable georeferenced overlays on a satellite base map."
        demo={<div data-testid="demo-slot">live demo instance</div>}
        code={`<LayerViewer manifest={manifest} />`}
      />,
    );

    expect(screen.getByRole("heading", { name: "LayerViewer" })).toBeInTheDocument();
    expect(
      screen.getByText("Toggleable georeferenced overlays on a satellite base map."),
    ).toBeInTheDocument();
    expect(screen.getByTestId("demo-slot")).toBeInTheDocument();
    expect(screen.getByText("<LayerViewer manifest={manifest} />")).toBeInTheDocument();
  });

  it("renders the demo slot inside a labeled region, distinct from the code region", () => {
    render(
      <ComponentShowcase
        title="Model3D"
        description="Orbit-and-measure 3D mesh viewer."
        demo={<div data-testid="demo-slot">orbit viewer</div>}
        code={`<Model3D mesh={mesh} />`}
      />,
    );

    const demoRegion = screen.getByRole("region", { name: "Model3D demo" });
    const usageRegion = screen.getByRole("region", { name: "Model3D usage" });

    expect(demoRegion).toContainElement(screen.getByTestId("demo-slot"));
    expect(usageRegion).toHaveTextContent("<Model3D mesh={mesh} />");
  });

  it("has no opinion about gating — renders identically with no auth-related props available", () => {
    // Nothing to assert beyond "it renders at all with only the four
    // documented props" — the point is the props list itself has no
    // gating-related field (e.g. no `isGated`/`passcode`/`requireAuth`),
    // which TypeScript already enforces at the call site above. This test
    // exists so a future accidental addition of such a prop shows up as an
    // intentional diff here, not silently.
    const { container } = render(
      <ComponentShowcase title="VideoTour" description="Doorway-linked video walkthrough." demo={<div />} code="" />,
    );
    expect(container).not.toBeEmptyDOMElement();
  });
});
