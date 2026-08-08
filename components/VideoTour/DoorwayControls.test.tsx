// BDD specs for <DoorwayControls> in isolation (VideoTour.test.tsx covers
// it as wired into full navigation). See docs/components/video-tour.md's
// behavior item 2: "Show a doorway button per edge... + sync the minimap
// highlight" and the busy-guard ("no double-fire").
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DoorwayControls } from "./DoorwayControls";
import { makeEdge, makeRoom } from "./tour.fixtures";

describe("<DoorwayControls>", () => {
  const rooms = [
    makeRoom({ id: "kitchen", label: "Kitchen" }),
    makeRoom({ id: "attic", label: "Attic" }),
  ];

  it("renders one button per edge, resolving each target room's label", () => {
    const edges = [makeEdge("kitchen"), makeEdge("attic")];
    render(<DoorwayControls edges={edges} rooms={rooms} onNavigate={vi.fn()} />);

    expect(screen.getByRole("button", { name: "→ Kitchen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "→ Attic" })).toBeInTheDocument();
  });

  it("prefers the edge's own label override over the target room's label", () => {
    const edges = [makeEdge("kitchen", { label: "To the Kitchen" })];
    render(<DoorwayControls edges={edges} rooms={rooms} onNavigate={vi.fn()} />);

    expect(screen.getByRole("button", { name: "→ To the Kitchen" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "→ Kitchen" })).not.toBeInTheDocument();
  });

  it("renders nothing for a dead-end room with no edges", () => {
    const { container } = render(
      <DoorwayControls edges={[]} rooms={rooms} onNavigate={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("calls onNavigate with the clicked edge", () => {
    const onNavigate = vi.fn();
    const edges = [makeEdge("kitchen")];
    render(<DoorwayControls edges={edges} rooms={rooms} onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole("button", { name: "→ Kitchen" }));

    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith(edges[0]);
  });

  it("disables every button and ignores clicks when disabled (busy-guard)", () => {
    const onNavigate = vi.fn();
    const edges = [makeEdge("kitchen")];
    render(
      <DoorwayControls edges={edges} rooms={rooms} onNavigate={onNavigate} disabled />,
    );

    const button = screen.getByRole("button", { name: "→ Kitchen" });
    expect(button).toBeDisabled();

    fireEvent.click(button);
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
