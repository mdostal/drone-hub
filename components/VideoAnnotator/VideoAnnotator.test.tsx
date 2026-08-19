// BDD specs for <VideoAnnotator>'s player foundation: source wiring
// (mp4 vs .m3u8, native-HLS vs hls.js), playback controls, the scrub bar,
// and zoom/pan. Drawing/annotation and export are a later pass — out of
// scope here on purpose (see VideoAnnotator.tsx's doc comment).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { VideoAnnotator } from "./VideoAnnotator";

// hls.js needs real MediaSource support to do anything, which jsdom doesn't
// provide — mocked here so the "does this component wire hls.js up
// correctly" question is testable independent of that. Mirrors the shape
// of the real default export (a class with a static isSupported() and
// instance loadSource/attachMedia/destroy).
vi.mock("hls.js", () => {
  class MockHls {
    static isSupported = vi.fn(() => false);
    static instances: MockHls[] = [];
    loadSource = vi.fn();
    attachMedia = vi.fn();
    destroy = vi.fn();
    constructor() {
      MockHls.instances.push(this);
    }
  }
  return { default: MockHls };
});

import Hls from "hls.js";
const MockHls = Hls as unknown as {
  isSupported: ReturnType<typeof vi.fn>;
  instances: Array<{
    loadSource: ReturnType<typeof vi.fn>;
    attachMedia: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  }>;
};

function getVideo(container: HTMLElement): HTMLVideoElement {
  return container.querySelector("video") as HTMLVideoElement;
}

/** The transform-bearing wrapper div directly around the <video>. */
function getPanWrapper(container: HTMLElement): HTMLDivElement {
  return getVideo(container).parentElement as HTMLDivElement;
}

describe("<VideoAnnotator>", () => {
  beforeEach(() => {
    MockHls.isSupported.mockReset();
    MockHls.isSupported.mockReturnValue(false);
    MockHls.instances.length = 0;
  });

  describe("source wiring", () => {
    it("assigns a plain mp4 URL directly to video.src, never touching hls.js", () => {
      const { container } = render(<VideoAnnotator src="https://example.test/clip.mp4" />);
      const video = getVideo(container);

      expect(video.src).toBe("https://example.test/clip.mp4");
      expect(MockHls.instances).toHaveLength(0);
    });

    it("assigns an .m3u8 URL directly when the browser supports HLS natively (Safari)", () => {
      const canPlayTypeSpy = vi
        .spyOn(HTMLMediaElement.prototype, "canPlayType")
        .mockReturnValue("probably");

      const { container } = render(<VideoAnnotator src="https://example.test/clip.m3u8" />);
      const video = getVideo(container);

      expect(video.src).toBe("https://example.test/clip.m3u8");
      expect(MockHls.instances).toHaveLength(0);

      canPlayTypeSpy.mockRestore();
    });

    it("falls back to hls.js when native HLS isn't supported but Hls.isSupported() is", () => {
      const canPlayTypeSpy = vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockReturnValue("");
      MockHls.isSupported.mockReturnValue(true);

      render(<VideoAnnotator src="https://example.test/clip.m3u8" />);

      expect(MockHls.instances).toHaveLength(1);
      expect(MockHls.instances[0].loadSource).toHaveBeenCalledWith("https://example.test/clip.m3u8");
      expect(MockHls.instances[0].attachMedia).toHaveBeenCalledTimes(1);

      canPlayTypeSpy.mockRestore();
    });

    it("does nothing and doesn't crash when neither native HLS nor hls.js is supported", () => {
      const canPlayTypeSpy = vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockReturnValue("");
      MockHls.isSupported.mockReturnValue(false);

      expect(() => render(<VideoAnnotator src="https://example.test/clip.m3u8" />)).not.toThrow();
      expect(MockHls.instances).toHaveLength(0);

      canPlayTypeSpy.mockRestore();
    });

    it("destroys the previous hls.js instance when the source changes", () => {
      const canPlayTypeSpy = vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockReturnValue("");
      MockHls.isSupported.mockReturnValue(true);

      const { rerender } = render(<VideoAnnotator src="https://example.test/a.m3u8" />);
      const first = MockHls.instances[0];

      rerender(<VideoAnnotator src="https://example.test/b.m3u8" />);

      expect(first.destroy).toHaveBeenCalledTimes(1);
      expect(MockHls.instances).toHaveLength(2);

      canPlayTypeSpy.mockRestore();
    });
  });

  describe("playback controls", () => {
    it("renders paused (no autoplay) with a Play button by default", () => {
      render(<VideoAnnotator src="https://example.test/clip.mp4" />);
      expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    });

    it("play/pause button calls video.play()/pause(), and its label follows real play/pause events", () => {
      const playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
      const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
      const { container } = render(<VideoAnnotator src="https://example.test/clip.mp4" />);
      const video = getVideo(container);

      fireEvent.click(screen.getByRole("button", { name: "Play" }));
      expect(playSpy).toHaveBeenCalledTimes(1);
      fireEvent.play(video);
      expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Pause" }));
      expect(pauseSpy).toHaveBeenCalledTimes(1);
      fireEvent.pause(video);
      expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();

      playSpy.mockRestore();
      pauseSpy.mockRestore();
    });

    it("shows current time / duration, formatted mm:ss, tracking real video events", () => {
      const { container } = render(<VideoAnnotator src="https://example.test/clip.mp4" />);
      const video = getVideo(container);

      Object.defineProperty(video, "duration", { value: 125, configurable: true });
      fireEvent.loadedMetadata(video);
      Object.defineProperty(video, "currentTime", { value: 65, configurable: true, writable: true });
      fireEvent.timeUpdate(video);

      expect(screen.getByText("1:05 / 2:05")).toBeInTheDocument();
    });
  });

  describe("scrub bar", () => {
    it("reflects duration as its max and seeks video.currentTime when dragged", () => {
      const { container } = render(<VideoAnnotator src="https://example.test/clip.mp4" />);
      const video = getVideo(container);

      Object.defineProperty(video, "duration", { value: 10, configurable: true });
      fireEvent.loadedMetadata(video);

      const slider = screen.getByRole("slider", { name: "Seek" }) as HTMLInputElement;
      expect(slider.max).toBe("10");

      fireEvent.change(slider, { target: { value: "4.5" } });

      expect(video.currentTime).toBe(4.5);
      expect(slider.value).toBe("4.5");
    });
  });

  describe("zoom + pan", () => {
    it("defaults to 100% zoom with a disabled Reset zoom button", () => {
      render(<VideoAnnotator src="https://example.test/clip.mp4" />);

      expect(screen.getByRole("slider", { name: "Zoom" })).toHaveValue("1");
      expect(screen.getByText("100%")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Reset zoom" })).toBeDisabled();
    });

    it("scales the video wrapper's transform when the zoom slider changes", () => {
      const { container } = render(<VideoAnnotator src="https://example.test/clip.mp4" />);
      const wrapper = getPanWrapper(container);

      fireEvent.change(screen.getByRole("slider", { name: "Zoom" }), { target: { value: "2" } });

      expect(wrapper.style.transform).toContain("scale(2)");
      expect(screen.getByText("200%")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Reset zoom" })).not.toBeDisabled();
    });

    it("pans via click-drag once zoomed in past 1x", () => {
      const { container } = render(<VideoAnnotator src="https://example.test/clip.mp4" />);
      const wrapper = getPanWrapper(container);

      fireEvent.change(screen.getByRole("slider", { name: "Zoom" }), { target: { value: "2" } });

      fireEvent.mouseDown(wrapper, { clientX: 100, clientY: 100 });
      fireEvent.mouseMove(window, { clientX: 130, clientY: 80 });
      fireEvent.mouseUp(window);

      expect(wrapper.style.transform).toContain("translate(30px, -20px)");
    });

    it("does not pan while at 1x zoom (pan only engages once zoomed in)", () => {
      const { container } = render(<VideoAnnotator src="https://example.test/clip.mp4" />);
      const wrapper = getPanWrapper(container);

      fireEvent.mouseDown(wrapper, { clientX: 100, clientY: 100 });
      fireEvent.mouseMove(window, { clientX: 200, clientY: 200 });
      fireEvent.mouseUp(window);

      expect(wrapper.style.transform).toContain("translate(0px, 0px)");
    });

    it("clamps pan to the max offset for the current zoom level", () => {
      const { container } = render(<VideoAnnotator src="https://example.test/clip.mp4" />);
      const wrapper = getPanWrapper(container);

      // zoom=2 -> maxPan = (2-1)*150 = 150
      fireEvent.change(screen.getByRole("slider", { name: "Zoom" }), { target: { value: "2" } });

      fireEvent.mouseDown(wrapper, { clientX: 0, clientY: 0 });
      fireEvent.mouseMove(window, { clientX: 10000, clientY: -10000 });
      fireEvent.mouseUp(window);

      expect(wrapper.style.transform).toContain("translate(150px, -150px)");
    });

    it("clamps existing pan down immediately when zooming back out (not just on the next drag)", () => {
      const { container } = render(<VideoAnnotator src="https://example.test/clip.mp4" />);
      const wrapper = getPanWrapper(container);

      fireEvent.change(screen.getByRole("slider", { name: "Zoom" }), { target: { value: "3" } });
      fireEvent.mouseDown(wrapper, { clientX: 0, clientY: 0 });
      fireEvent.mouseMove(window, { clientX: 10000, clientY: 0 });
      fireEvent.mouseUp(window);
      // zoom=3 -> maxPan = (3-1)*150 = 300
      expect(wrapper.style.transform).toContain("translate(300px, 0px)");

      // zoom back down to 1.5 -> maxPan = (1.5-1)*150 = 75
      fireEvent.change(screen.getByRole("slider", { name: "Zoom" }), { target: { value: "1.5" } });
      expect(wrapper.style.transform).toContain("translate(75px, 0px)");
    });

    it("'Reset zoom' restores 1x scale and clears pan", () => {
      const { container } = render(<VideoAnnotator src="https://example.test/clip.mp4" />);
      const wrapper = getPanWrapper(container);

      fireEvent.change(screen.getByRole("slider", { name: "Zoom" }), { target: { value: "2" } });
      fireEvent.mouseDown(wrapper, { clientX: 0, clientY: 0 });
      fireEvent.mouseMove(window, { clientX: 50, clientY: 50 });
      fireEvent.mouseUp(window);

      fireEvent.click(screen.getByRole("button", { name: "Reset zoom" }));

      expect(wrapper.style.transform).toContain("scale(1)");
      expect(wrapper.style.transform).toContain("translate(0px, 0px)");
      expect(screen.getByRole("slider", { name: "Zoom" })).toHaveValue("1");
      expect(screen.getByRole("button", { name: "Reset zoom" })).toBeDisabled();
    });
  });
});
