// BDD spec for app/(showcase)/docs/layout.tsx — the sidebar layout added
// 2026-08-10 for the real, shadcn-style docs section (Introduction +
// every component's writeup, all reachable from one persistent sidebar).
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import DocsLayout from "./layout";

vi.mock("next/navigation", () => ({
  usePathname: () => "/docs/components/layer-viewer",
}));

describe("<DocsLayout>", () => {
  it("renders the Introduction link plus a link for every current component's doc page", () => {
    render(
      <DocsLayout>
        <div>doc content</div>
      </DocsLayout>,
    );

    expect(screen.getByRole("link", { name: "Introduction" })).toHaveAttribute("href", "/docs");
    for (const name of [
      "VideoTour",
      "LayerViewer",
      "Model3D",
      "LandOverlay",
      "VoxelTerrain",
      "ContentEngine",
      "MinecraftExport",
      "FileUpload",
      "FileList",
      "ProcessingStatus",
      "FlightCoverageAnalyzer",
      "TourBuilder",
    ]) {
      expect(screen.getByRole("link", { name })).toBeInTheDocument();
    }
  });

  it("renders its children unmodified alongside the sidebar", () => {
    render(
      <DocsLayout>
        <div data-testid="doc-page-content">hello</div>
      </DocsLayout>,
    );

    expect(screen.getByTestId("doc-page-content")).toHaveTextContent("hello");
    expect(screen.getByRole("navigation", { name: "Documentation" })).toBeInTheDocument();
  });

  it("every component link points at its /docs/components/<slug> writeup, not the live demo", () => {
    render(
      <DocsLayout>
        <div />
      </DocsLayout>,
    );

    expect(screen.getByRole("link", { name: "LayerViewer" })).toHaveAttribute(
      "href",
      "/docs/components/layer-viewer",
    );
    expect(screen.getByRole("link", { name: "TourBuilder" })).toHaveAttribute(
      "href",
      "/docs/components/tour-builder",
    );
  });
});
