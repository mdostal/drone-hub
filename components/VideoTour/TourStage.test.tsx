// BDD specs for <TourStage> in isolation (VideoTour.test.tsx covers it as
// wired into full navigation). See docs/components/video-tour.md's
// behavior item 1 ("render current node: spin OR still") and item 3 (the
// transition overlay: real clip OR timed wipe).
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
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

  describe("spin video controls (real, per videotour-real-controls-and-sample-clip)", () => {
    function renderSpinRoom() {
      const room = makeRoom({
        id: "kitchen",
        label: "Kitchen",
        spin: "https://example.test/kitchen-spin.mp4",
      });
      const utils = render(<TourStage room={room} transition={null} />);
      const video = utils.container.querySelector(
        'video[src="https://example.test/kitchen-spin.mp4"]',
      ) as HTMLVideoElement;
      return { ...utils, video };
    }

    it("renders a play/pause button, a seek slider, and 0.5x/1x/1.5x/2x speed buttons", () => {
      renderSpinRoom();

      expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
      expect(screen.getByRole("slider", { name: "Seek" })).toBeInTheDocument();
      const speedGroup = screen.getByRole("group", { name: "Playback speed" });
      for (const label of ["0.5x", "1x", "1.5x", "2x"]) {
        expect(within(speedGroup).getByRole("button", { name: label })).toBeInTheDocument();
      }
    });

    it("still autoplays muted on arrival — unregressed silent-loop default for anyone who doesn't touch the controls", () => {
      const { video } = renderSpinRoom();
      expect(video).toHaveAttribute("autoplay");
      expect(video).toHaveAttribute("loop");
      expect(video.muted).toBe(true);
    });

    it("play/pause button calls video.play()/pause() and its label follows the video's real play/pause events", () => {
      const playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
      const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
      const { video } = renderSpinRoom();

      // Starts "playing" (autoplay); the button offers to Pause it.
      const button = screen.getByRole("button", { name: "Pause" });
      fireEvent.click(button);
      expect(pauseSpy).toHaveBeenCalledTimes(1);
      // The button's own label only follows the video's real 'pause' event,
      // not the click itself — matching browser reality (play()/pause() are
      // requests, not synchronous state changes).
      fireEvent.pause(video);
      expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Play" }));
      expect(playSpy).toHaveBeenCalledTimes(1);
      fireEvent.play(video);
      expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();

      playSpy.mockRestore();
      pauseSpy.mockRestore();
    });

    it("mute/unmute button toggles video.muted and its own label", () => {
      const { video } = renderSpinRoom();
      expect(video.muted).toBe(true);

      fireEvent.click(screen.getByRole("button", { name: "Unmute" }));
      expect(video.muted).toBe(false);
      expect(screen.getByRole("button", { name: "Mute" })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Mute" }));
      expect(video.muted).toBe(true);
      expect(screen.getByRole("button", { name: "Unmute" })).toBeInTheDocument();
    });

    it("dragging the seek slider sets video.currentTime", () => {
      const { video } = renderSpinRoom();
      // Simulate 'loadedmetadata' having reported a 5s duration, as the real
      // sample clip does — the range's max is 0 (thus unusable) until then.
      Object.defineProperty(video, "duration", { value: 5, configurable: true });
      fireEvent.loadedMetadata(video);

      const slider = screen.getByRole("slider", { name: "Seek" }) as HTMLInputElement;
      fireEvent.change(slider, { target: { value: "2.5" } });

      expect(video.currentTime).toBe(2.5);
      expect(slider.value).toBe("2.5");
    });

    it("clicking a speed button sets video.playbackRate and marks that button pressed", () => {
      const { video } = renderSpinRoom();
      const speedGroup = screen.getByRole("group", { name: "Playback speed" });

      expect(within(speedGroup).getByRole("button", { name: "1x" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );

      fireEvent.click(within(speedGroup).getByRole("button", { name: "2x" }));

      expect(video.playbackRate).toBe(2);
      expect(within(speedGroup).getByRole("button", { name: "2x" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(within(speedGroup).getByRole("button", { name: "1x" })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    });
  });

  describe("transition-clip video has NO controls (regression guard — the deadlock-risk scope line)", () => {
    it("renders zero play/pause, mute, seek, or speed controls for the transition clip, even when the current room also has a spin control bar", () => {
      // Worst case for accidental scope creep: BOTH a spin-having room AND
      // an in-flight transition clip rendered at once (a real mid-navigation
      // frame) — proves the transition clip doesn't pick up controls even
      // when spin's controls are present elsewhere in the same tree.
      const room = makeRoom({
        id: "kitchen",
        label: "Kitchen",
        spin: "https://example.test/kitchen-spin.mp4",
      });
      const { container } = render(
        <TourStage
          room={room}
          transition={{ label: "Living Room", clipUrl: "https://example.test/to-living.mp4" }}
        />,
      );

      const clipVideo = container.querySelector(
        'video[src="https://example.test/to-living.mp4"]',
      ) as HTMLVideoElement;
      expect(clipVideo).not.toBeNull();
      expect(clipVideo).toHaveAttribute("autoplay");
      // React sets `muted` as a DOM property, not a reflected HTML attribute
      // (same reason `value`/`checked` don't show up via getAttribute either)
      // — assert the property directly, matching the SpinVideo autoplay spec
      // above.
      expect(clipVideo.muted).toBe(true);
      expect(clipVideo).not.toHaveAttribute("controls");

      // Exactly one seek slider / speed group in the whole tree — the
      // spin room's, not a second one for the transition clip.
      expect(screen.getAllByRole("slider", { name: "Seek" })).toHaveLength(1);
      expect(screen.getAllByRole("group", { name: "Playback speed" })).toHaveLength(1);
    });

    it("renders zero controls for the transition clip when the current room has no spin (still + wipe world)", () => {
      const room = makeRoom({ id: "kitchen", label: "Kitchen" });
      render(
        <TourStage
          room={room}
          transition={{ label: "Living Room", clipUrl: "https://example.test/to-living.mp4" }}
        />,
      );

      expect(screen.queryByRole("slider", { name: "Seek" })).not.toBeInTheDocument();
      expect(screen.queryByRole("group", { name: "Playback speed" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Play" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Pause" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Mute" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Unmute" })).not.toBeInTheDocument();
    });
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
