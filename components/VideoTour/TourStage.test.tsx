// BDD specs for <TourStage> in isolation (VideoTour.test.tsx covers it as
// wired into full navigation). See docs/components/video-tour.md's
// behavior item 1 ("render current node: spin OR still") and item 3 (the
// transition overlay: real clip OR timed wipe).
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TourStage } from "./TourStage";
import { makeRoom } from "./tour.fixtures";

describe("<TourStage>", () => {
  it("renders the still image with a Ken-Burns treatment and the room label as caption when spin is null (P1)", () => {
    const room = makeRoom({ id: "kitchen", label: "Kitchen", still: "https://example.test/kitchen.jpg" });

    render(<TourStage room={room} transition={null} />);

    const img = screen.getByRole("img", { name: "Kitchen" });
    expect(img).toHaveAttribute("src", "https://example.test/kitchen.jpg");
    expect(img.className).toMatch(/kenburns/);
    expect(screen.getByText("Kitchen")).toBeInTheDocument();
  });

  it("shows no transition overlay when transition is null", () => {
    const room = makeRoom({ id: "kitchen", label: "Kitchen" });
    render(<TourStage room={room} transition={null} />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the 'flying to X…' wipe overlay when transition.clipUrl is null (P1 fallback)", () => {
    const room = makeRoom({ id: "kitchen", label: "Kitchen" });
    render(
      <TourStage room={room} transition={{ label: "Living Room", clipUrl: null }} />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("flying to Living Room…");
  });

  it("P2 smoke only: doesn't crash when room.spin is set, and renders a video instead of the still", () => {
    const room = makeRoom({
      id: "kitchen",
      label: "Kitchen",
      spin: "https://example.test/kitchen-spin.mp4",
    });

    expect(() => render(<TourStage room={room} transition={null} />)).not.toThrow();
    expect(screen.queryByRole("img", { name: "Kitchen" })).not.toBeInTheDocument();
    expect(screen.getByText("Kitchen")).toBeInTheDocument();
  });

  it("P2 smoke only: doesn't crash when transition.clipUrl is set, and fires onTransitionClipEnded on 'ended'", () => {
    const room = makeRoom({ id: "kitchen", label: "Kitchen" });
    const onTransitionClipEnded = vi.fn();

    const { container } = render(
      <TourStage
        room={room}
        transition={{ label: "Living Room", clipUrl: "https://example.test/to-living.mp4" }}
        onTransitionClipEnded={onTransitionClipEnded}
      />,
    );

    const video = container.querySelector('video[src="https://example.test/to-living.mp4"]');
    expect(video).not.toBeNull();

    expect(() => fireEvent.ended(video as HTMLVideoElement)).not.toThrow();
    expect(onTransitionClipEnded).toHaveBeenCalledTimes(1);
  });
});
