// BDD specs for <FloorPlanMap> in isolation (VideoTour.test.tsx covers it
// as wired into full navigation). See docs/components/video-tour.md's
// acceptance criterion: "Floor-plan minimap: positions, edges, current-room
// highlight, clickable."
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { FloorPlanMap } from "./FloorPlanMap";
import { buildSyntheticTour } from "./tour.fixtures";

describe("<FloorPlanMap>", () => {
  const tour = buildSyntheticTour();
  const living = tour.rooms.find((r) => r.id === "living")!;

  it("renders one node per room, positioned at room.pos", () => {
    render(
      <FloorPlanMap
        rooms={tour.rooms}
        currentRoomId="front"
        currentEdges={tour.rooms.find((r) => r.id === "front")!.neighbors}
        onNavigate={vi.fn()}
      />,
    );

    const kitchenNode = screen.getByRole("button", { name: "Kitchen" });
    expect(kitchenNode).toHaveStyle({ left: "80%", top: "40%" });
  });

  it("highlights the current room via aria-current", () => {
    render(
      <FloorPlanMap
        rooms={tour.rooms}
        currentRoomId="living"
        currentEdges={living.neighbors}
        onNavigate={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Living Room" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(screen.getByRole("button", { name: "Kitchen" })).not.toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("only nodes reachable via a currentEdges entry are clickable; the current room's own node never is", () => {
    render(
      <FloorPlanMap
        rooms={tour.rooms}
        currentRoomId="living"
        currentEdges={living.neighbors} // front, kitchen, attic
        onNavigate={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Kitchen" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Attic" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Front Exterior" })).not.toBeDisabled();
    // living is "here" but has no edge to itself -> never clickable.
    expect(screen.getByRole("button", { name: "Living Room" })).toBeDisabled();
  });

  it("calls onNavigate with the matching edge when a reachable node is clicked", () => {
    const onNavigate = vi.fn();
    render(
      <FloorPlanMap
        rooms={tour.rooms}
        currentRoomId="living"
        currentEdges={living.neighbors}
        onNavigate={onNavigate}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Kitchen" }));

    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith(living.neighbors.find((e) => e.to === "kitchen"));
  });

  it("disables every node, including otherwise-reachable ones, when disabled is set (busy-guard)", () => {
    const onNavigate = vi.fn();
    render(
      <FloorPlanMap
        rooms={tour.rooms}
        currentRoomId="living"
        currentEdges={living.neighbors}
        onNavigate={onNavigate}
        disabled
      />,
    );

    const kitchenNode = screen.getByRole("button", { name: "Kitchen" });
    expect(kitchenNode).toBeDisabled();

    fireEvent.click(kitchenNode);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("draws one deduped connecting line per doorway pair, between the two rooms' positions", () => {
    const { container } = render(
      <FloorPlanMap rooms={tour.rooms} currentRoomId="front" currentEdges={[]} onNavigate={vi.fn()} />,
    );

    // front<->living, living<->kitchen, living<->attic are each bidirectional
    // in the fixture -> 3 deduped lines, not 6.
    const lines = container.querySelectorAll("svg line");
    expect(lines).toHaveLength(3);

    const front = tour.rooms.find((r) => r.id === "front")!;
    expect(
      Array.from(lines).some(
        (line) =>
          line.getAttribute("x1") === String(front.pos[0]) &&
          line.getAttribute("y1") === String(front.pos[1]) &&
          line.getAttribute("x2") === String(living.pos[0]) &&
          line.getAttribute("y2") === String(living.pos[1]),
      ),
    ).toBe(true);
  });

  it("renders the whole minimap under an accessible 'Floor plan' label", () => {
    render(
      <FloorPlanMap
        rooms={tour.rooms}
        currentRoomId="front"
        currentEdges={[]}
        onNavigate={vi.fn()}
      />,
    );

    const minimap = screen.getByLabelText("Floor plan");
    expect(within(minimap).getAllByRole("button")).toHaveLength(tour.rooms.length);
  });
});
