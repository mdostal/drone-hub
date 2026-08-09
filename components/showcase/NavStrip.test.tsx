// BDD specs for <NavStrip> — the persistent wayfinding strip
// app/(showcase)/layout.tsx renders. Covers
// site-nav-and-copy-buttons.yaml's "a persistent nav strip listing all 7
// components is visible, each linking to its live demo" acceptance
// criterion, plus the active-route highlighting this component isolates
// (mocking next/navigation's usePathname(), the actual reason this is its
// own client component rather than folded into the Server Component
// layout.tsx).
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NavStrip } from "./NavStrip";

const mockUsePathname = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

const ITEMS = [
  { name: "VideoTour", href: "/components/video-tour" },
  { name: "LayerViewer", href: "/components/layer-viewer" },
  { name: "Model3D", href: "/components/model3d" },
] as const;

describe("<NavStrip>", () => {
  it("Given a list of items, when rendered, then every item renders as a link to its href", () => {
    mockUsePathname.mockReturnValue("/components/video-tour");
    render(<NavStrip items={ITEMS} />);

    for (const item of ITEMS) {
      expect(screen.getByRole("link", { name: item.name })).toHaveAttribute("href", item.href);
    }
  });

  it("marks the link matching the current pathname as the active/current page", () => {
    mockUsePathname.mockReturnValue("/components/layer-viewer");
    render(<NavStrip items={ITEMS} />);

    expect(screen.getByRole("link", { name: "LayerViewer" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "VideoTour" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Model3D" })).not.toHaveAttribute("aria-current");
  });

  it("marks no link as active when the current pathname matches none of the items (e.g. a doc page)", () => {
    mockUsePathname.mockReturnValue("/docs/components/layer-viewer");
    render(<NavStrip items={ITEMS} />);

    for (const item of ITEMS) {
      expect(screen.getByRole("link", { name: item.name })).not.toHaveAttribute("aria-current");
    }
  });

  it("renders inside a labeled nav landmark", () => {
    mockUsePathname.mockReturnValue("/");
    render(<NavStrip items={ITEMS} />);
    expect(screen.getByRole("navigation", { name: "Components" })).toBeInTheDocument();
  });
});
