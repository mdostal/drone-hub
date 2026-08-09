// BDD spec for the shared app/(showcase)/layout.tsx — covers
// site-nav-and-copy-buttons.yaml's "Given any /components/* or
// /docs/components/* page, when rendered, then a persistent nav strip
// listing all 7 components is visible, each linking to its live demo"
// acceptance criterion, plus that it renders its `children` prop
// unmodified (proving it's additive, not a replacement page).
//
// This file is a plain synchronous function (no async, no cookies()/
// headers()/searchParams) — the actual "stays static" guarantee is verified
// via `next build`'s route table (see this story's commit/PR notes), which
// a jsdom-based vitest render can't observe directly. This spec instead
// pins down the render-time contract: renders NavStrip with all 7 items +
// whatever children it's given.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ShowcaseLayout from "./layout";

vi.mock("next/navigation", () => ({
  usePathname: () => "/components/video-tour",
}));

const EXPECTED_NAMES = ["VideoTour", "LayerViewer", "Model3D", "LandOverlay", "VoxelTerrain", "ContentEngine", "MinecraftExport"];

describe("<ShowcaseLayout>", () => {
  it("renders a nav link for all 7 current components/tools", () => {
    render(
      <ShowcaseLayout>
        <div>page content</div>
      </ShowcaseLayout>,
    );

    for (const name of EXPECTED_NAMES) {
      expect(screen.getByRole("link", { name })).toBeInTheDocument();
    }
  });

  it("renders its children unmodified alongside the nav strip", () => {
    render(
      <ShowcaseLayout>
        <div data-testid="page-content">hello</div>
      </ShowcaseLayout>,
    );

    expect(screen.getByTestId("page-content")).toHaveTextContent("hello");
    expect(screen.getByRole("navigation", { name: "Components" })).toBeInTheDocument();
  });

  it("every nav link's href points at that component's live demo, mirroring app/page.tsx's TOC", () => {
    render(
      <ShowcaseLayout>
        <div />
      </ShowcaseLayout>,
    );

    expect(screen.getByRole("link", { name: "VideoTour" })).toHaveAttribute("href", "/components/video-tour");
    expect(screen.getByRole("link", { name: "LayerViewer" })).toHaveAttribute("href", "/components/layer-viewer");
    expect(screen.getByRole("link", { name: "Model3D" })).toHaveAttribute("href", "/components/model3d");
    expect(screen.getByRole("link", { name: "LandOverlay" })).toHaveAttribute("href", "/components/land-overlay");
    expect(screen.getByRole("link", { name: "VoxelTerrain" })).toHaveAttribute("href", "/components/voxel-terrain");
    expect(screen.getByRole("link", { name: "ContentEngine" })).toHaveAttribute(
      "href",
      "/properties/2806-prado/engine",
    );
    // No standalone demo page — points at the VoxelTerrain demo, where the
    // .schem download action actually lives (matches app/page.tsx TOC's own
    // note for this entry).
    expect(screen.getByRole("link", { name: "MinecraftExport" })).toHaveAttribute("href", "/components/voxel-terrain");
  });
});
