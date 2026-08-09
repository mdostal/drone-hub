// BDD specs for the root landing page — the real front door tools.mdostal.com
// would link to. Re-homes equivalent ToC-rendering coverage from the deleted
// app/(showcase)/components/page.test.tsx (which rendered the old 5-entry
// ComponentsIndexPage in isolation) now extended to all 10 components/tools,
// per .pHive/epics/framework-docs-site/stories/framework-docs-site-landing-page.yaml
// and design-discussion.md §2 ("Landing page consolidation"). FileUpload/
// FileList/ProcessingStatus added by the generic-file-components story
// (nav-video-pipeline-files epic).
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import Home from "./page";

describe("<Home> (root landing page)", () => {
  it("lists all 10 components/tools as ToC entries", () => {
    render(<Home />);

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
    ]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  it("links each of these components to distinct demo and doc pages", () => {
    render(<Home />);

    const cases: Array<[name: string, demoHref: string, docHref: string]> = [
      ["VideoTour", "/components/video-tour", "/docs/components/video-tour"],
      ["LayerViewer", "/components/layer-viewer", "/docs/components/layer-viewer"],
      ["Model3D", "/components/model3d", "/docs/components/model3d"],
      ["LandOverlay", "/components/land-overlay", "/docs/components/land-overlay"],
      ["VoxelTerrain", "/components/voxel-terrain", "/docs/components/voxel-terrain"],
      ["FileUpload", "/components/file-upload", "/docs/components/file-upload"],
      ["FileList", "/components/file-list", "/docs/components/file-list"],
      ["ProcessingStatus", "/components/processing-status", "/docs/components/processing-status"],
    ];

    for (const [name, demoHref, docHref] of cases) {
      const card = screen.getByText(name).closest("li") as HTMLElement;
      const demoLink = within(card).getByRole("link", { name: /live demo/i });
      const docLink = within(card).getByRole("link", { name: /docs/i });

      expect(demoLink).toHaveAttribute("href", demoHref);
      expect(docLink).toHaveAttribute("href", docHref);
      expect(demoLink).not.toBe(docLink);
    }
  });

  it("gives the ContentEngine card a demo link into /properties and a doc link", () => {
    render(<Home />);

    const card = screen.getByText("ContentEngine").closest("li") as HTMLElement;
    const demoLink = within(card).getByRole("link", { name: /live demo/i });
    const docLink = within(card).getByRole("link", { name: /docs/i });

    expect(demoLink).toHaveAttribute("href", "/properties/2806-prado/engine");
    expect(docLink).toHaveAttribute("href", "/docs/components/content-engine");
    expect(demoLink).not.toBe(docLink);
  });

  it("gives the MinecraftExport card only a doc link (no fabricated demo page) plus a pointer to the VoxelTerrain page where the real download action lives", () => {
    render(<Home />);

    const card = screen.getByText("MinecraftExport").closest("li") as HTMLElement;
    const docLink = within(card).getByRole("link", { name: /docs/i });
    const pointerLink = within(card).getByRole("link", { name: /voxelterrain/i });

    expect(docLink).toHaveAttribute("href", "/docs/components/minecraft-export");
    expect(pointerLink).toHaveAttribute("href", "/components/voxel-terrain");
    // No demo link into a non-existent /components/minecraft-export page.
    expect(within(card).queryByRole("link", { name: /live demo/i })).not.toBeInTheDocument();
  });

  it("shows a short, non-marketing framework-positioning header", () => {
    render(<Home />);

    expect(screen.getByRole("heading", { name: /Drone Hub/i })).toBeInTheDocument();
    expect(screen.getByText(/plug-and-play react components for drone property intelligence/i)).toBeInTheDocument();
  });
});
