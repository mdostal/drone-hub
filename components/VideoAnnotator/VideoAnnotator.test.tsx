// BDD specs for <VideoAnnotator>: source wiring (mp4 vs .m3u8, native-HLS
// vs hls.js), playback controls, the scrub bar, zoom/pan, the drawing/
// annotation toolbar (point/rectangle/freehand/text), the zoom/pan-aware
// coordinate math that keeps annotations aligned with the video, the
// click-vs-drag disambiguation that keeps panning from leaving a stray
// annotation, and PNG snapshot export.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import {
  VideoAnnotator,
  canvasPointToNormalized,
  drawAnnotationShape,
  normalizedToCanvasPoint,
  type VideoAnnotation,
} from "./VideoAnnotator";

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

/** The STABLE (untransformed) container div — the pan wrapper's own parent
 *  — that the overlay canvas is sized against. No new test-only markup
 *  needed for this: it's just one level up the existing DOM walk
 *  getPanWrapper already does. */
function getFrameContainer(container: HTMLElement): HTMLDivElement {
  return getPanWrapper(container).parentElement as HTMLDivElement;
}

function getCanvas(container: HTMLElement): HTMLCanvasElement {
  return container.querySelector("canvas") as HTMLCanvasElement;
}

/** Stubs an element's getBoundingClientRect — jsdom's real implementation
 *  always returns all-zero geometry. Same pattern/rationale as
 *  components/LayerViewer/CompareSwipe.test.tsx's stubWrapperRect. */
function stubRect(el: HTMLElement, rect: { width: number; height: number; left?: number; top?: number }) {
  const left = rect.left ?? 0;
  const top = rect.top ?? 0;
  el.getBoundingClientRect = () =>
    ({
      left,
      top,
      right: left + rect.width,
      bottom: top + rect.height,
      width: rect.width,
      height: rect.height,
      x: left,
      y: top,
      toJSON() {},
    }) as DOMRect;
}

/** A recording fake CanvasRenderingContext2D — jsdom's canvas has no real
 *  2D rendering to read pixels back from, so "did this draw the right
 *  thing" is verified the way this repo's own drawAnnotationShape doc
 *  comment calls for: by asserting the exact sequence of draw calls (method
 *  + args) a real browser's canvas would have received. Every draw method
 *  drawAnnotationShape/drawDraftShape/handleExport actually calls is
 *  recorded; style properties (strokeStyle/fillStyle/etc) are plain
 *  assignable properties, not tracked, since none of these tests assert on
 *  color. */
function createMockCtx() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const record =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
    };
  const ctx = {
    calls,
    save: vi.fn(record("save")),
    restore: vi.fn(record("restore")),
    clearRect: vi.fn(record("clearRect")),
    beginPath: vi.fn(record("beginPath")),
    moveTo: vi.fn(record("moveTo")),
    lineTo: vi.fn(record("lineTo")),
    closePath: vi.fn(record("closePath")),
    stroke: vi.fn(record("stroke")),
    fill: vi.fn(record("fill")),
    fillRect: vi.fn(record("fillRect")),
    strokeRect: vi.fn(record("strokeRect")),
    arc: vi.fn(record("arc")),
    fillText: vi.fn(record("fillText")),
    measureText: vi.fn(() => ({ width: 40 }) as TextMetrics),
    setLineDash: vi.fn(record("setLineDash")),
    drawImage: vi.fn(record("drawImage")),
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 0,
    font: "",
    textBaseline: "",
  };
  return ctx as unknown as CanvasRenderingContext2D & { calls: Array<{ method: string; args: unknown[] }> };
}

let mockCtx: ReturnType<typeof createMockCtx>;

/** One shared mock context returned for EVERY canvas that requests one —
 *  both the component's own live overlay <canvas> and the offscreen
 *  <canvas> handleExport creates via document.createElement. That's
 *  intentional (not a limitation): export-specific tests clear
 *  `mockCtx.calls` immediately before triggering the export so only the
 *  export's own draw calls remain to assert against. */
beforeEach(() => {
  mockCtx = createMockCtx();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    (() => mockCtx) as unknown as typeof HTMLCanvasElement.prototype.getContext,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
    callback(new Blob(["fake-png-bytes"], { type: "image/png" }));
  });
  // Plain assignment (not vi.stubGlobal("URL", ...)) — replacing the whole
  // global would swap out the real URL constructor other code may still
  // rely on; jsdom's own createObjectURL/revokeObjectURL are unimplemented
  // stubs (throw "Not implemented"), so these two methods specifically need
  // overriding, nothing else about URL does.
  URL.createObjectURL = vi.fn(() => "blob:fake");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

/** Stubs the frame container's and the overlay canvas's rects to a fixed,
 *  round-numbered size (matching CompareSwipe.test.tsx's "round numbers"
 *  rationale) and fires a 'resize' so the component's measureCanvasSize
 *  picks it up — it only measures on mount/'loadedmetadata'/resize, and at
 *  mount time (before these stubs exist) jsdom's real getBoundingClientRect
 *  would report an all-zero rect. */
function setupZoomedFrame(container: HTMLElement, size = { width: 200, height: 100 }) {
  const frame = getFrameContainer(container);
  const canvas = getCanvas(container);
  stubRect(frame, size);
  stubRect(canvas, size);
  fireEvent(window, new Event("resize"));
  return { frame, canvas };
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

describe("<VideoAnnotator> zoom/pan coordinate math", () => {
  it("is the identity at zoom=1 with no pan", () => {
    const size = { width: 200, height: 100 };
    const screenPt = normalizedToCanvasPoint({ u: 0.25, v: 0.75 }, size, 1, { x: 0, y: 0 });
    expect(screenPt).toEqual({ x: 50, y: 75 });
    expect(canvasPointToNormalized(screenPt, size, 1, { x: 0, y: 0 })).toEqual({ u: 0.25, v: 0.75 });
  });

  it("round-trips through an arbitrary zoom + pan", () => {
    const size = { width: 200, height: 100 };
    const zoom = 2.5;
    const pan = { x: 30, y: -15 };
    const original = { u: 0.4, v: 0.6 };
    const screenPt = normalizedToCanvasPoint(original, size, zoom, pan);
    const roundTripped = canvasPointToNormalized(screenPt, size, zoom, pan);
    expect(roundTripped.u).toBeCloseTo(original.u, 10);
    expect(roundTripped.v).toBeCloseTo(original.v, 10);
  });

  it("maps a screen click at 2x zoom to the correct underlying (unzoomed) frame position", () => {
    // 200x100 canvas, center (100,50), zoom=2, pan={0,0}: a screen click
    // 40px right of center is only 20px right of center on the actual
    // unzoomed frame.
    const point = canvasPointToNormalized({ x: 140, y: 50 }, { width: 200, height: 100 }, 2, { x: 0, y: 0 });
    expect(point.u).toBeCloseTo(0.6, 10); // (100 + 20) / 200
    expect(point.v).toBeCloseTo(0.5, 10);
  });
});

describe("drawAnnotationShape", () => {
  const toScreen = (p: { u: number; v: number }) => ({ x: p.u * 200, y: p.v * 100 });

  it("draws a point as a filled arc at the mapped position", () => {
    const ctx = createMockCtx();
    const annotation: VideoAnnotation = { id: "a1", tool: "point", point: { u: 0.5, v: 0.5 } };
    drawAnnotationShape(ctx, annotation, toScreen);
    expect(ctx.calls.map((c) => c.method)).toEqual(["save", "beginPath", "arc", "fill", "restore"]);
    expect(ctx.calls[2].args).toEqual([100, 50, 6, 0, Math.PI * 2]);
  });

  it("draws a rectangle via strokeRect with normalized (min-corner, size) args", () => {
    const ctx = createMockCtx();
    const annotation: VideoAnnotation = {
      id: "r1",
      tool: "rectangle",
      start: { u: 0.6, v: 0.2 },
      end: { u: 0.2, v: 0.6 },
    };
    drawAnnotationShape(ctx, annotation, toScreen);
    const strokeRectCall = ctx.calls.find((c) => c.method === "strokeRect");
    // start=(120,20), end=(40,60) -> x=40, y=20, w=80, h=40
    expect(strokeRectCall?.args).toEqual([40, 20, 80, 40]);
  });

  it("draws freehand as a stroked path through every point in order", () => {
    const ctx = createMockCtx();
    const annotation: VideoAnnotation = {
      id: "f1",
      tool: "freehand",
      points: [
        { u: 0, v: 0 },
        { u: 0.5, v: 0.25 },
        { u: 1, v: 1 },
      ],
    };
    drawAnnotationShape(ctx, annotation, toScreen);
    expect(ctx.calls.map((c) => c.method)).toEqual(["save", "beginPath", "moveTo", "lineTo", "lineTo", "stroke", "restore"]);
    expect(ctx.calls[2].args).toEqual([0, 0]);
    expect(ctx.calls[3].args).toEqual([100, 25]);
    expect(ctx.calls[4].args).toEqual([200, 100]);
  });

  it("draws a text label as a background fillRect + fillText", () => {
    const ctx = createMockCtx();
    const annotation: VideoAnnotation = { id: "t1", tool: "text", point: { u: 0.1, v: 0.1 }, text: "Crack" };
    drawAnnotationShape(ctx, annotation, toScreen);
    expect(ctx.calls.map((c) => c.method)).toContain("fillRect");
    const fillTextCall = ctx.calls.find((c) => c.method === "fillText");
    expect(fillTextCall?.args[0]).toBe("Crack");
  });
});

describe("<VideoAnnotator> drawing toolbar", () => {
  it("renders all four tools, none active by default, no annotations yet", () => {
    render(<VideoAnnotator src="https://example.test/clip.mp4" />);
    const group = screen.getByRole("group", { name: "Annotation drawing tool" });
    for (const name of ["Point", "Rectangle", "Freehand", "Label"]) {
      expect(within(group).getByRole("button", { name })).toHaveAttribute("aria-pressed", "false");
    }
    expect(screen.getByText("No annotations yet")).toBeInTheDocument();
  });

  it("clicking a tool activates it and shows its hint; clicking it again deactivates it", () => {
    render(<VideoAnnotator src="https://example.test/clip.mp4" />);
    const pointButton = screen.getByRole("button", { name: "Point" });

    fireEvent.click(pointButton);
    expect(pointButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Click the video to place a point")).toBeInTheDocument();

    fireEvent.click(pointButton);
    expect(pointButton).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByText("Click the video to place a point")).not.toBeInTheDocument();
  });

  it("the overlay canvas is pointer-events-none until a draw tool is selected", () => {
    const { container } = render(<VideoAnnotator src="https://example.test/clip.mp4" />);
    const canvas = getCanvas(container);
    expect(canvas.className).toContain("pointer-events-none");

    fireEvent.click(screen.getByRole("button", { name: "Point" }));
    expect(canvas.className).not.toContain("pointer-events-none");
  });
});

describe("<VideoAnnotator> drawing gestures (click-vs-drag disambiguation)", () => {
  it("point tool: a genuine click places a point annotation at the clicked position", () => {
    const onAnnotationsChange = vi.fn();
    const { container } = render(
      <VideoAnnotator src="https://example.test/clip.mp4" onAnnotationsChange={onAnnotationsChange} />,
    );
    setupZoomedFrame(container);
    fireEvent.click(screen.getByRole("button", { name: "Point" }));
    const canvas = getCanvas(container);

    fireEvent.mouseDown(canvas, { clientX: 100, clientY: 50 });
    fireEvent.mouseUp(window, { clientX: 101, clientY: 51 }); // ~1.4px — well under the click threshold

    expect(onAnnotationsChange).toHaveBeenCalledTimes(1);
    const [placed] = onAnnotationsChange.mock.calls[0][0] as VideoAnnotation[];
    expect(placed.tool).toBe("point");
    expect((placed as { point: { u: number; v: number } }).point.u).toBeCloseTo(0.5, 5);
    expect((placed as { point: { u: number; v: number } }).point.v).toBeCloseTo(0.5, 5);
  });

  it("point tool: a drag (movement beyond the click threshold) places NO annotation", () => {
    const onAnnotationsChange = vi.fn();
    const { container } = render(
      <VideoAnnotator src="https://example.test/clip.mp4" onAnnotationsChange={onAnnotationsChange} />,
    );
    setupZoomedFrame(container);
    fireEvent.click(screen.getByRole("button", { name: "Point" }));
    const canvas = getCanvas(container);

    fireEvent.mouseDown(canvas, { clientX: 100, clientY: 50 });
    fireEvent.mouseMove(window, { clientX: 140, clientY: 50 }); // 40px, over CLICK_MAX_MOVEMENT_PX
    fireEvent.mouseUp(window, { clientX: 140, clientY: 50 });

    expect(onAnnotationsChange).not.toHaveBeenCalled();
    expect(screen.getByText("No annotations yet")).toBeInTheDocument();
  });

  it("rectangle tool: a plain click creates no shape; a real drag creates a normalized rectangle", () => {
    const onAnnotationsChange = vi.fn();
    const { container } = render(
      <VideoAnnotator src="https://example.test/clip.mp4" onAnnotationsChange={onAnnotationsChange} />,
    );
    setupZoomedFrame(container);
    fireEvent.click(screen.getByRole("button", { name: "Rectangle" }));
    const canvas = getCanvas(container);

    fireEvent.mouseDown(canvas, { clientX: 50, clientY: 50 });
    fireEvent.mouseUp(window, { clientX: 51, clientY: 51 });
    expect(onAnnotationsChange).not.toHaveBeenCalled();

    fireEvent.mouseDown(canvas, { clientX: 40, clientY: 20 });
    fireEvent.mouseMove(window, { clientX: 120, clientY: 60 });
    fireEvent.mouseUp(window, { clientX: 120, clientY: 60 });

    expect(onAnnotationsChange).toHaveBeenCalledTimes(1);
    const [placed] = onAnnotationsChange.mock.calls[0][0] as VideoAnnotation[];
    expect(placed.tool).toBe("rectangle");
    expect(placed).toMatchObject({ start: { u: 0.2, v: 0.2 }, end: { u: 0.6, v: 0.6 } });
  });

  it("freehand tool: dragging captures a multi-point path; a plain click captures none", () => {
    const onAnnotationsChange = vi.fn();
    const { container } = render(
      <VideoAnnotator src="https://example.test/clip.mp4" onAnnotationsChange={onAnnotationsChange} />,
    );
    setupZoomedFrame(container);
    fireEvent.click(screen.getByRole("button", { name: "Freehand" }));
    const canvas = getCanvas(container);

    fireEvent.mouseDown(canvas, { clientX: 10, clientY: 10 });
    fireEvent.mouseUp(window, { clientX: 11, clientY: 10 });
    expect(onAnnotationsChange).not.toHaveBeenCalled();

    fireEvent.mouseDown(canvas, { clientX: 10, clientY: 10 });
    fireEvent.mouseMove(window, { clientX: 50, clientY: 10 });
    fireEvent.mouseMove(window, { clientX: 90, clientY: 10 });
    fireEvent.mouseUp(window, { clientX: 90, clientY: 10 });

    expect(onAnnotationsChange).toHaveBeenCalledTimes(1);
    const [placed] = onAnnotationsChange.mock.calls[0][0] as VideoAnnotation[];
    expect(placed.tool).toBe("freehand");
    expect((placed as { points: unknown[] }).points.length).toBeGreaterThanOrEqual(3);
  });

  it("text tool: a click prompts for a label and places it; cancelling the prompt places nothing", () => {
    const onAnnotationsChange = vi.fn();
    const { container } = render(
      <VideoAnnotator src="https://example.test/clip.mp4" onAnnotationsChange={onAnnotationsChange} />,
    );
    setupZoomedFrame(container);
    fireEvent.click(screen.getByRole("button", { name: "Label" }));
    const canvas = getCanvas(container);

    const promptSpy = vi.spyOn(window, "prompt").mockReturnValueOnce(null);
    fireEvent.mouseDown(canvas, { clientX: 60, clientY: 30 });
    fireEvent.mouseUp(window, { clientX: 60, clientY: 30 });
    expect(onAnnotationsChange).not.toHaveBeenCalled();

    promptSpy.mockReturnValueOnce("Crack in siding");
    fireEvent.mouseDown(canvas, { clientX: 60, clientY: 30 });
    fireEvent.mouseUp(window, { clientX: 60, clientY: 30 });

    expect(onAnnotationsChange).toHaveBeenCalledTimes(1);
    const [placed] = onAnnotationsChange.mock.calls[0][0] as VideoAnnotation[];
    expect(placed).toMatchObject({ tool: "text", text: "Crack in siding" });
    expect(screen.getByText("Label: Crack in siding")).toBeInTheDocument();

    promptSpy.mockRestore();
  });
});

describe("<VideoAnnotator> zoom/pan-aware annotation alignment", () => {
  it("an annotation drawn while zoomed in maps to the correct underlying frame position, and re-projects to a new screen position if the zoom level changes again afterward", () => {
    const onAnnotationsChange = vi.fn();
    const { container } = render(
      <VideoAnnotator src="https://example.test/clip.mp4" onAnnotationsChange={onAnnotationsChange} />,
    );
    setupZoomedFrame(container); // canvasSize = 200x100
    fireEvent.change(screen.getByRole("slider", { name: "Zoom" }), { target: { value: "2" } });

    fireEvent.click(screen.getByRole("button", { name: "Point" }));
    const canvas = getCanvas(container);
    // 40px right of the canvas's own center (100,50) -> (140,50). At
    // zoom=2, pan={0,0} the underlying (unzoomed) offset is only 20px:
    // u = (100 + 20) / 200 = 0.6.
    fireEvent.mouseDown(canvas, { clientX: 140, clientY: 50 });
    fireEvent.mouseUp(window, { clientX: 140, clientY: 50 });

    expect(onAnnotationsChange).toHaveBeenCalledTimes(1);
    const [placed] = onAnnotationsChange.mock.calls[0][0] as VideoAnnotation[];
    const point = (placed as { point: { u: number; v: number } }).point;
    expect(point.u).toBeCloseTo(0.6, 5);
    expect(point.v).toBeCloseTo(0.5, 5);

    // The overlay's own redraw (triggered by the annotation being added,
    // still at zoom=2) re-projects that normalized point back to the exact
    // screen position it was clicked at.
    const arcCallsAtZoom2 = mockCtx.calls.filter((c) => c.method === "arc");
    expect(arcCallsAtZoom2.at(-1)?.args.slice(0, 2)).toEqual([140, 50]);

    // Zooming back out AFTER placement must re-project the SAME stored
    // normalized point to a DIFFERENT screen position — proof the geometry
    // itself never changed, only where it's drawn: at zoom=1, pan={0,0},
    // u=0.6 on a 200-wide canvas is x=120.
    mockCtx.calls.length = 0;
    fireEvent.change(screen.getByRole("slider", { name: "Zoom" }), { target: { value: "1" } });
    const arcCallsAtZoom1 = mockCtx.calls.filter((c) => c.method === "arc");
    expect(arcCallsAtZoom1.at(-1)?.args.slice(0, 2)).toEqual([120, 50]);
  });
});

describe("<VideoAnnotator> panning never leaves a stray annotation", () => {
  it("dragging the zoomed video with no draw tool active pans as before and places zero annotations", () => {
    const onAnnotationsChange = vi.fn();
    const { container } = render(
      <VideoAnnotator src="https://example.test/clip.mp4" onAnnotationsChange={onAnnotationsChange} />,
    );
    setupZoomedFrame(container);
    const wrapper = getPanWrapper(container);

    fireEvent.change(screen.getByRole("slider", { name: "Zoom" }), { target: { value: "2" } });
    fireEvent.mouseDown(wrapper, { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(window, { clientX: 160, clientY: 70 });
    fireEvent.mouseUp(window);

    // Existing pan behavior is unaffected...
    expect(wrapper.style.transform).toContain("translate(60px, -30px)");
    // ...and it created no annotation.
    expect(onAnnotationsChange).not.toHaveBeenCalled();
    expect(screen.getByText("No annotations yet")).toBeInTheDocument();
  });
});

describe("<VideoAnnotator> legend + delete", () => {
  it("lists a placed annotation in the legend and removes it via its own Delete button", () => {
    const onAnnotationsChange = vi.fn();
    const { container } = render(
      <VideoAnnotator src="https://example.test/clip.mp4" onAnnotationsChange={onAnnotationsChange} />,
    );
    setupZoomedFrame(container);
    fireEvent.click(screen.getByRole("button", { name: "Point" }));
    const canvas = getCanvas(container);
    fireEvent.mouseDown(canvas, { clientX: 100, clientY: 50 });
    fireEvent.mouseUp(window, { clientX: 100, clientY: 50 });

    expect(screen.getByRole("list", { name: "Placed annotations" })).toBeInTheDocument();
    expect(screen.getByText("point")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete point annotation" }));

    expect(screen.getByText("No annotations yet")).toBeInTheDocument();
    expect(onAnnotationsChange).toHaveBeenLastCalledWith([]);
  });
});

describe("<VideoAnnotator> export", () => {
  it("composites the current video frame + all annotations onto an offscreen canvas and downloads a PNG", () => {
    const { container } = render(<VideoAnnotator src="https://example.test/clip.mp4" />);
    setupZoomedFrame(container); // overlay canvas = 200x100
    const video = getVideo(container);
    Object.defineProperty(video, "videoWidth", { value: 400, configurable: true });
    Object.defineProperty(video, "videoHeight", { value: 200, configurable: true });

    // Place one point annotation dead-center (u=0.5, v=0.5).
    fireEvent.click(screen.getByRole("button", { name: "Point" }));
    const canvas = getCanvas(container);
    fireEvent.mouseDown(canvas, { clientX: 100, clientY: 50 });
    fireEvent.mouseUp(window, { clientX: 100, clientY: 50 });

    mockCtx.calls.length = 0;
    fireEvent.click(screen.getByRole("button", { name: "Export snapshot" }));

    // The frame is drawn first, at the video's NATIVE decode resolution
    // (400x200) — NOT the overlay canvas's 200x100 rendered size — proving
    // export composites the whole frame, not the zoomed viewport.
    const drawImageCall = mockCtx.calls.find((c) => c.method === "drawImage");
    expect(drawImageCall?.args).toEqual([video, 0, 0, 400, 200]);

    // The point is replayed scaled straight to the EXPORT canvas's own
    // resolution (u=0.5*400=200, v=0.5*200=100), not through
    // normalizedToCanvasPoint's zoom/pan math (which is overlay-canvas-only).
    const arcCall = mockCtx.calls.find((c) => c.method === "arc");
    expect(arcCall?.args).toEqual([200, 100, 6, 0, Math.PI * 2]);

    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
  });

  it("does nothing if the video has no known dimensions yet", () => {
    const { container } = render(<VideoAnnotator src="https://example.test/clip.mp4" />);
    mockCtx.calls.length = 0;

    fireEvent.click(screen.getByRole("button", { name: "Export snapshot" }));

    expect(mockCtx.calls.find((c) => c.method === "drawImage")).toBeUndefined();
  });
});
