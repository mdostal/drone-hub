// BDD specs for the public /components index page, per
// .pHive/epics/model3d/stories/model3d-showcase-shell.yaml's acceptance
// criterion: "Given the index page, when rendered, then it lists
// VideoTour/LayerViewer/Model3D as linked cards." The genuinely-public
// (not-gated-by-middleware) claim itself is verified at the middleware
// layer (see middleware.test.ts precedent) and via a manual Playwright
// check with no gate cookie set — a route group's exclusion from
// middleware.ts's config.matcher isn't something a component-level render
// test can observe, since middleware never runs in this test environment.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import ComponentsIndexPage from "./page";

describe("<ComponentsIndexPage>", () => {
  it("lists VideoTour, LayerViewer, and Model3D as cards linking to their showcase pages", () => {
    render(<ComponentsIndexPage />);

    expect(screen.getByRole("link", { name: /VideoTour/ })).toHaveAttribute("href", "/components/video-tour");
    expect(screen.getByRole("link", { name: /LayerViewer/ })).toHaveAttribute("href", "/components/layer-viewer");
    expect(screen.getByRole("link", { name: /Model3D/ })).toHaveAttribute("href", "/components/model3d");
  });

  it("gives each card a one-line description alongside its name", () => {
    render(<ComponentsIndexPage />);

    expect(screen.getByText(/Toggleable, opacity-controlled georeferenced overlays/)).toBeInTheDocument();
    expect(screen.getByText(/Orbit-and-measure 3D mesh/)).toBeInTheDocument();
    expect(screen.getByText(/doorway-linked video clips/)).toBeInTheDocument();
  });
});
