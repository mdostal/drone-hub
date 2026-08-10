import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DocsSidebar } from "./DocsSidebar";
import type { DocsSidebarSection } from "./DocsSidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/docs/components/layer-viewer",
}));

const SECTIONS: DocsSidebarSection[] = [
  { title: "Get Started", items: [{ name: "Introduction", href: "/docs" }] },
  {
    title: "Components",
    items: [
      { name: "LayerViewer", href: "/docs/components/layer-viewer" },
      { name: "Model3D", href: "/docs/components/model3d" },
    ],
  },
];

describe("<DocsSidebar>", () => {
  it("renders every section's items as links", () => {
    render(<DocsSidebar sections={SECTIONS} />);
    expect(screen.getByRole("link", { name: "Introduction" })).toHaveAttribute("href", "/docs");
    expect(screen.getByRole("link", { name: "LayerViewer" })).toHaveAttribute(
      "href",
      "/docs/components/layer-viewer",
    );
    expect(screen.getByRole("link", { name: "Model3D" })).toHaveAttribute("href", "/docs/components/model3d");
  });

  it("marks the current route as the active page via aria-current", () => {
    render(<DocsSidebar sections={SECTIONS} />);
    expect(screen.getByRole("link", { name: "LayerViewer" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Model3D" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Introduction" })).not.toHaveAttribute("aria-current");
  });

  it("renders section titles", () => {
    render(<DocsSidebar sections={SECTIONS} />);
    expect(screen.getByText("Get Started")).toBeInTheDocument();
    expect(screen.getByText("Components")).toBeInTheDocument();
  });

  it("is a labeled navigation landmark", () => {
    render(<DocsSidebar sections={SECTIONS} />);
    expect(screen.getByRole("navigation", { name: "Documentation" })).toBeInTheDocument();
  });
});
