"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type MouseEvent as ReactMouseEvent } from "react";
import Hls from "hls.js";
import { cx } from "./cx";

/** mm:ss for the scrub bar's time readout. NaN/Infinity (duration unknown
 *  before 'loadedmetadata', or a still-loading video) render as "0:00"
 *  rather than "NaN:NaN". Mirrors components/VideoTour/TourStage.tsx's
 *  formatTime — duplicated rather than shared, matching this repo's
 *  per-component-family precedent (see ./cx.ts). */
function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.1;

/** Pan range (px) at MAX_ZOOM, scaled linearly down to 0 at MIN_ZOOM. Not
 *  derived from measured container size on purpose — a fixed-per-zoom-level
 *  bound keeps pan behavior deterministic (and easy to unit test) rather
 *  than depending on layout, which jsdom doesn't compute in tests and which
 *  would make the exact clamp point unpredictable across screen sizes. */
const PAN_RANGE_PX = 150;

function maxPanFor(zoom: number): number {
  return Math.max(0, (zoom - 1) * PAN_RANGE_PX);
}

interface Pan {
  x: number;
  y: number;
}

function clampPan(pan: Pan, zoom: number): Pan {
  const max = maxPanFor(zoom);
  return {
    x: Math.min(max, Math.max(-max, pan.x)),
    y: Math.min(max, Math.max(-max, pan.y)),
  };
}

/** src is HLS (.m3u8) rather than a plain progressive file (mp4/webm/etc).
 *  Query strings on a signed/CDN URL are common, hence the `(\?|$)` — a bare
 *  `.endsWith` would miss `clip.m3u8?token=...`. */
function isHlsSource(src: string): boolean {
  return /\.m3u8(\?|$)/i.test(src);
}

// ---------------------------------------------------------------------------
// Drawing/annotation tools + export.
//
// Every annotation's geometry is stored as "video-frame-normalized" points
// -- (0,0) is the top-left of the video's own UNZOOMED rendered box, (1,1)
// is the bottom-right -- independent of the video's intrinsic decode
// resolution AND of the current zoom/pan. That's the key move that makes
// zoom/pan-aware annotating work at all: an annotation's stored geometry
// never changes when the user zooms/pans, only WHERE it gets drawn on
// screen does (via normalizedToCanvasPoint below), so it's automatically
// still in the right spot after any later zoom/pan.
//
// The overlay <canvas> is a sibling of the zoom/pan-transformed video
// wrapper (see <VideoAnnotator>'s render), not a child of it -- it does NOT
// get the wrapper's own `transform: translate(...) scale(...)` applied to
// it, and is sized off the STABLE, untransformed container box (never off
// the video element itself, which -- being inside the transformed wrapper
// -- would report its OWN already-zoomed box via getBoundingClientRect once
// zoom !== 1, corrupting the measurement). Keeping the canvas outside the
// transform means every annotation has to be explicitly re-projected to
// screen space on every zoom/pan change (normalizedToCanvasPoint, in the
// redraw effect below) rather than getting that "for free" from the
// browser's own transform math -- more code, but it's what makes the
// click-to-normalized conversion (canvasPointToNormalized) symmetric and
// independently testable, and it's what the export path reuses (drawing
// the same annotations onto an untransformed offscreen canvas at the
// video's native resolution, ignoring zoom/pan entirely -- see
// handleExport).
// ---------------------------------------------------------------------------

export interface NormalizedPoint {
  u: number;
  v: number;
}

/** One row per drawing tool in the toolbar, matching
 *  components/LayerViewer/LayerViewer.tsx's AnnotationMode precedent
 *  (a fixed tool id union + a display-order array + label/hint lookups). */
export type AnnotationTool = "point" | "rectangle" | "freehand" | "text";

export interface PointAnnotation {
  id: string;
  tool: "point";
  point: NormalizedPoint;
}
export interface RectangleAnnotation {
  id: string;
  tool: "rectangle";
  start: NormalizedPoint;
  end: NormalizedPoint;
}
export interface FreehandAnnotation {
  id: string;
  tool: "freehand";
  points: NormalizedPoint[];
}
export interface TextAnnotation {
  id: string;
  tool: "text";
  point: NormalizedPoint;
  text: string;
}
/** A single placed annotation, discriminated on `tool`. */
export type VideoAnnotation = PointAnnotation | RectangleAnnotation | FreehandAnnotation | TextAnnotation;

interface CanvasSize {
  width: number;
  height: number;
}

/** A drawing gesture only counts as a "click" (placing a point/text
 *  annotation) if it moves less than this many screen pixels between
 *  mousedown and mouseup, and completes within CLICK_MAX_DURATION_MS below
 *  -- otherwise it's a genuine drag (drawing a rectangle/freehand path, or
 *  -- when no draw tool is active -- panning the zoomed video via the
 *  wrapper's own mousedown handler) and must never drop a stray point/text
 *  annotation. Rectangle/freehand gestures use the SAME threshold in
 *  reverse: a "click" (movement under this bound) is discarded rather than
 *  committed, so an accidental tap with one of those tools active doesn't
 *  leave behind a degenerate zero-size shape.
 *
 *  Same values and rationale as components/Model3D/Model3D.tsx's
 *  MeasureController (CLICK_MAX_MOVEMENT_PX / CLICK_MAX_DURATION_MS) --
 *  ported rather than shared because that component's constants are
 *  three.js/pointer-event specific and this one is plain DOM mouse-event
 *  based (matching this file's existing pan-drag handling above, not
 *  Model3D's pointerdown/pointerup), not because the values should ever
 *  diverge. */
const CLICK_MAX_MOVEMENT_PX = 6;
const CLICK_MAX_DURATION_MS = 500;

/** Accent color for every drawn annotation -- app/globals.css's
 *  --color-accent (#e8590c), hardcoded here for the same reason
 *  components/Model3D/Model3D.tsx's MEASURE_ACCENT_COLOR is: the 2D canvas
 *  API has no notion of a CSS custom property, only literal color values. */
const ANNOTATION_COLOR = "#e8590c";

const TOOL_ORDER: AnnotationTool[] = ["point", "rectangle", "freehand", "text"];
const TOOL_LABELS: Record<AnnotationTool, string> = {
  point: "Point",
  rectangle: "Rectangle",
  freehand: "Freehand",
  text: "Label",
};
const TOOL_HINTS: Record<AnnotationTool, string> = {
  point: "Click the video to place a point",
  rectangle: "Drag to draw a rectangle",
  freehand: "Drag to draw a freehand line",
  text: "Click the video to add a label",
};

/** Converts a normalized (video-frame-relative) point into the pixel
 *  position it needs to be drawn at on the OVERLAY canvas right now, given
 *  the current zoom/pan -- i.e. the forward projection that makes a placed
 *  annotation visually track the (CSS-transformed) video underneath it,
 *  since the canvas itself isn't part of that transform (see this file's
 *  header comment above). Mirrors the CSS
 *  `transform: translate(pan.x, pan.y) scale(zoom)` (with
 *  `transform-origin: center center`) applied to the video's own wrapper:
 *  a point is scaled around the box's center, then translated by the pan
 *  offset. */
export function normalizedToCanvasPoint(
  point: NormalizedPoint,
  size: CanvasSize,
  zoom: number,
  pan: Pan,
): { x: number; y: number } {
  const centerX = size.width / 2;
  const centerY = size.height / 2;
  const unzoomedX = point.u * size.width;
  const unzoomedY = point.v * size.height;
  return {
    x: centerX + zoom * (unzoomedX - centerX) + pan.x,
    y: centerY + zoom * (unzoomedY - centerY) + pan.y,
  };
}

/** The inverse of normalizedToCanvasPoint -- converts an actual on-screen
 *  pixel position on the overlay canvas (already relative to the canvas's
 *  own top-left, e.g. from a mouse event via getBoundingClientRect) back
 *  into video-frame-normalized space, given the current zoom/pan. This is
 *  what makes drawing while zoomed/panned land on the correct UNDERLYING
 *  video-frame position instead of wherever the cursor happens to be on
 *  screen -- e.g. at zoom=2, a screen point 40px right of center is only
 *  20px right of center on the actual (unzoomed) frame. */
export function canvasPointToNormalized(
  pointPx: { x: number; y: number },
  size: CanvasSize,
  zoom: number,
  pan: Pan,
): NormalizedPoint {
  const centerX = size.width / 2;
  const centerY = size.height / 2;
  const unzoomedX = centerX + (pointPx.x - centerX - pan.x) / zoom;
  const unzoomedY = centerY + (pointPx.y - centerY - pan.y) / zoom;
  return {
    u: size.width > 0 ? unzoomedX / size.width : 0,
    v: size.height > 0 ? unzoomedY / size.height : 0,
  };
}

/** Draws one placed annotation onto a 2D canvas context, at whatever pixel
 *  position `toPoint` maps its stored (video-frame-normalized) geometry to.
 *  Pure w.r.t. component state -- takes the mapper as a parameter instead of
 *  computing it -- so the SAME function draws both the live overlay canvas
 *  (toPoint = normalizedToCanvasPoint against the current zoom/pan) and the
 *  export snapshot (toPoint = plain `{x: u * width, y: v * height}`,
 *  ignoring zoom/pan entirely -- export always composites the WHOLE current
 *  frame, never just the currently-zoomed-in crop of it; see handleExport).
 *  Exported so VideoAnnotator.test.tsx can assert the exact draw calls a
 *  given annotation produces against a mock context -- jsdom has no real
 *  canvas rendering to read pixels back from -- but not part of the
 *  component's public API (not re-exported from index.ts). */
export function drawAnnotationShape(
  ctx: CanvasRenderingContext2D,
  annotation: VideoAnnotation,
  toPoint: (point: NormalizedPoint) => { x: number; y: number },
): void {
  ctx.save();
  ctx.strokeStyle = ANNOTATION_COLOR;
  ctx.fillStyle = ANNOTATION_COLOR;
  ctx.lineWidth = 2;

  switch (annotation.tool) {
    case "point": {
      const p = toPoint(annotation.point);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "rectangle": {
      const start = toPoint(annotation.start);
      const end = toPoint(annotation.end);
      ctx.strokeRect(
        Math.min(start.x, end.x),
        Math.min(start.y, end.y),
        Math.abs(end.x - start.x),
        Math.abs(end.y - start.y),
      );
      break;
    }
    case "freehand": {
      const points = annotation.points.map(toPoint);
      ctx.beginPath();
      points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
      break;
    }
    case "text": {
      const p = toPoint(annotation.point);
      ctx.font = "13px sans-serif";
      ctx.textBaseline = "top";
      const paddingX = 4;
      const paddingY = 2;
      const metrics = ctx.measureText(annotation.text);
      ctx.fillStyle = "rgba(15, 15, 15, 0.75)";
      ctx.fillRect(p.x, p.y, metrics.width + paddingX * 2, 16 + paddingY * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(annotation.text, p.x + paddingX, p.y + paddingY);
      break;
    }
  }

  ctx.restore();
}

/** An in-progress rectangle/freehand gesture, drawn as a live dashed
 *  preview while the mouse is still down. Stored directly in raw
 *  overlay-canvas pixel coordinates (NOT normalized) -- it's transient,
 *  never survives a zoom/pan change or a re-render once the gesture ends,
 *  so there's no need to round-trip it through video-frame-normalized
 *  space the way a committed VideoAnnotation is. */
type DraftShape =
  | { tool: "rectangle"; start: { x: number; y: number }; end: { x: number; y: number } }
  | { tool: "freehand"; points: Array<{ x: number; y: number }> };

function drawDraftShape(ctx: CanvasRenderingContext2D, draft: DraftShape): void {
  ctx.save();
  ctx.strokeStyle = ANNOTATION_COLOR;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  if (draft.tool === "rectangle") {
    const { start, end } = draft;
    ctx.strokeRect(
      Math.min(start.x, end.x),
      Math.min(start.y, end.y),
      Math.abs(end.x - start.x),
      Math.abs(end.y - start.y),
    );
  } else {
    ctx.beginPath();
    draft.points.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
  }
  ctx.restore();
}

export interface VideoAnnotatorProps {
  /** mp4 (or any progressive format the browser plays natively) or m3u8 URL. */
  src: string;
  /** poster shown before playback starts / while the video loads. */
  poster?: string;
  /** Fired with the full current annotation list whenever it changes
   *  (add or delete). This repo has no backend -- there is no server-side
   *  persistence anywhere in it -- so this callback is the ONLY mechanism
   *  a consuming app has to own persistence (localStorage, an API call,
   *  whatever it wants) if it wants annotations to survive beyond this
   *  component's own lifetime. Optional and side-effect-free on this
   *  component's own behavior if omitted. */
  onAnnotationsChange?: (shapes: VideoAnnotation[]) => void;
  className?: string;
}

/**
 * <VideoAnnotator> — play/pause, a scrub bar, a zoom+pan viewport control,
 * canvas-based drawing/annotation tools (point/rectangle/freehand/text),
 * and a PNG snapshot export of the current frame + its annotations.
 *
 * Playback pattern (play/pause/scrub/time state, driven off real video
 * events rather than optimistic state) is lifted from
 * components/VideoTour/TourStage.tsx's `<SpinVideo>`, the one existing
 * videoRef + `<video>` pattern in this repo. That component does NOT use
 * hls.js anywhere — VideoTour's manifest-driven clips (`spin`/`clip`) are
 * plain mp4 only, and `hls.js` (already a package.json dependency) sits
 * unused repo-wide before this component. So the HLS handling below is a
 * fresh, straightforward integration, not a reuse: `Hls.isSupported()`
 * (MediaSource-based) gates the hls.js path, falling back to the browser's
 * native HLS support (`canPlayType`, e.g. Safari, which plays .m3u8
 * directly and doesn't need — or support — MediaSource-based hls.js).
 *
 * Zoom/pan is a pure CSS `transform` (translate + scale) on a wrapper `div`
 * around the `<video>` — the video's own decode/render resolution is never
 * touched, this only changes what portion of the rendered frame is visible.
 * Zoom is a visible slider (the "pick one, make it discoverable" control
 * this story calls for — scroll-to-zoom was the alternative, deliberately
 * not implemented so there's no undocumented-gesture-only path). Pan is
 * click-drag, active only once zoomed in past 1x.
 *
 * The drawing overlay (a `<canvas>`) is deliberately kept OUTSIDE that
 * transformed wrapper — see this file's header comment above
 * (normalizedToCanvasPoint/canvasPointToNormalized) for the full
 * zoom/pan-aware coordinate math this requires. Pan and drawing are
 * mutually exclusive input modes rather than two gestures fighting over the
 * same pointer stream: the canvas is `pointer-events-none` whenever no draw
 * tool is selected, so a drag with no tool active falls straight through to
 * the existing pan-wrapper `onMouseDown` below completely unchanged (zero
 * regression risk to the zoom/pan behavior already shipped and tested) —
 * panning can *never* leave behind a stray annotation, by construction, not
 * just by a movement/duration heuristic. That heuristic
 * (CLICK_MAX_MOVEMENT_PX / CLICK_MAX_DURATION_MS above) is still very much
 * needed, and is the same click-vs-drag pattern
 * components/Model3D/Model3D.tsx's MeasureController uses: it's what stops
 * the point/text tools from dropping a point/label when a WHILE-A-DRAW-TOOL-
 * IS-ACTIVE gesture turns out to be a drag rather than a genuine tap (e.g.
 * a slightly jittery click, or the user starting to drag then stopping) —
 * and, symmetrically, what stops the rectangle/freehand tools from
 * committing a degenerate zero-size shape from an accidental tap.
 */
export function VideoAnnotator({ src, poster, onAnnotationsChange, className }: VideoAnnotatorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [paused, setPaused] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [pan, setPan] = useState<Pan>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  // Drawing/annotation state. `canvasSize` tracks the STABLE, untransformed
  // container box (see this file's header comment) — measured on mount, on
  // the video's 'loadedmetadata', and on window resize; never on every
  // zoom/pan tick (the whole point of keeping the canvas outside the
  // transform is that its own size never needs to change when zoom/pan
  // does). `annotationIdRef` is a plain incrementing counter rather than
  // crypto.randomUUID() — deterministic ids make assertions in
  // VideoAnnotator.test.tsx simpler, and unlike terra-draw (LayerViewer's
  // annotation library) this component owns id assignment itself, so there
  // is no external id source it needs to match.
  const [canvasSize, setCanvasSize] = useState<CanvasSize>({ width: 0, height: 0 });
  const [activeTool, setActiveTool] = useState<AnnotationTool | null>(null);
  const [annotations, setAnnotations] = useState<VideoAnnotation[]>([]);
  const [draft, setDraft] = useState<DraftShape | null>(null);
  const [gestureActive, setGestureActive] = useState(false);
  const gestureRef = useRef<{
    tool: AnnotationTool;
    startClientX: number;
    startClientY: number;
    startTime: number;
    points: Array<{ x: number; y: number }>;
  } | null>(null);
  const annotationIdRef = useRef(0);

  // Wire up the source: plain progressive files are just assigned directly;
  // .m3u8 goes through native HLS support if the browser has it (Safari),
  // otherwise hls.js's MediaSource-based player if it's supported, otherwise
  // there's genuinely nothing more to do (very old/unsupported browser).
  // All src assignment happens here (imperatively), never as a `src` prop
  // on the JSX <video> below, so there's exactly one code path setting it
  // regardless of which branch fires.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (!isHlsSource(src)) {
      video.src = src;
      return;
    }

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      return;
    }

    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(src);
      hls.attachMedia(video);
      hlsRef.current = hls;
      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    }

    // Neither native HLS nor hls.js's MediaSource path is available —
    // nothing more this component can do; video stays sourceless.
  }, [src]);

  // Reset playback/zoom state when the source changes out from under an
  // already-mounted player (props.src changing without a remount).
  useEffect(() => {
    setPaused(true);
    setCurrentTime(0);
    setDuration(0);
    setZoom(MIN_ZOOM);
    setPan({ x: 0, y: 0 });
  }, [src]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    // Driven by our own `paused` state, not a fresh read of `video.paused`
    // — matches TourStage's SpinVideo rationale: play()/pause() are async
    // requests, onPlay/onPause below are the real source of truth once they
    // settle.
    if (paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  const handleSeek = (event: ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    const value = Number(event.target.value);
    if (video) video.currentTime = value;
    setCurrentTime(value);
  };

  const handleZoomChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    setZoom(value);
    setPan((prev) => clampPan(prev, value));
  };

  const handleResetZoom = () => {
    setZoom(MIN_ZOOM);
    setPan({ x: 0, y: 0 });
  };

  const handlePanStart = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (zoom <= MIN_ZOOM) return; // pan only engages once zoomed in
    dragStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    setDragging(true);
  };

  // Track the drag on `window` (not just the wrapper) so a fast drag that
  // leaves the element mid-move doesn't silently stop panning.
  useEffect(() => {
    if (!dragging) return;

    const handleMove = (event: MouseEvent) => {
      const start = dragStartRef.current;
      if (!start) return;
      const next = {
        x: start.panX + (event.clientX - start.x),
        y: start.panY + (event.clientY - start.y),
      };
      setPan(clampPan(next, zoom));
    };

    const handleUp = () => {
      setDragging(false);
      dragStartRef.current = null;
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragging, zoom]);

  const zoomedIn = zoom > MIN_ZOOM;

  // Measures the STABLE (untransformed) container box — deliberately the
  // container, not the video element itself, which sits INSIDE the
  // zoom/pan-transformed wrapper and would report its own already-scaled
  // box via getBoundingClientRect once zoom !== 1 (see this file's header
  // comment). The container is unaffected by the wrapper's own transform
  // (CSS transforms never affect an ancestor's layout box), so this is
  // stable regardless of current zoom/pan — exactly the property the
  // overlay canvas's sizing needs.
  const measureCanvasSize = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    setCanvasSize({ width: Math.max(0, Math.round(rect.width)), height: Math.max(0, Math.round(rect.height)) });
  }, []);

  useEffect(() => {
    measureCanvasSize();
    window.addEventListener("resize", measureCanvasSize);
    return () => window.removeEventListener("resize", measureCanvasSize);
  }, [measureCanvasSize]);

  // Redraws the overlay canvas from scratch whenever anything that affects
  // where an annotation lands on screen changes: the annotation list
  // itself, the in-progress draft preview, zoom/pan (every placed
  // annotation gets re-projected via normalizedToCanvasPoint — this is what
  // keeps annotations visually glued to the video across zoom/pan changes),
  // or the canvas's own measured size.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const toScreen = (point: NormalizedPoint) => normalizedToCanvasPoint(point, canvasSize, zoom, pan);
    for (const annotation of annotations) {
      drawAnnotationShape(ctx, annotation, toScreen);
    }
    if (draft) {
      drawDraftShape(ctx, draft);
    }
  }, [annotations, draft, zoom, pan, canvasSize]);

  function nextAnnotationId(): string {
    annotationIdRef.current += 1;
    return `annotation-${annotationIdRef.current}`;
  }

  const commitAnnotation = useCallback(
    (annotation: VideoAnnotation) => {
      setAnnotations((prev) => {
        const next = [...prev, annotation];
        onAnnotationsChange?.(next);
        return next;
      });
    },
    [onAnnotationsChange],
  );

  const handleDeleteAnnotation = useCallback(
    (id: string) => {
      setAnnotations((prev) => {
        const next = prev.filter((annotation) => annotation.id !== id);
        onAnnotationsChange?.(next);
        return next;
      });
    },
    [onAnnotationsChange],
  );

  const handleToolClick = (tool: AnnotationTool) => {
    // Click the already-active tool to deselect it (back to pan/idle) —
    // same "click active to turn off" toggle affordance as
    // components/LayerViewer/LayerViewer.tsx's handleAnnotationModeClick.
    setActiveTool((prev) => (prev === tool ? null : tool));
  };

  function canvasLocalPoint(clientX: number, clientY: number): { x: number; y: number } | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  // Only reachable while a draw tool is active — the canvas is
  // `pointer-events-none` otherwise (see the JSX below), so a drag with no
  // tool selected never reaches this handler at all and falls straight
  // through to the pan wrapper beneath it.
  const handleCanvasMouseDown = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    if (!activeTool) return;
    const local = canvasLocalPoint(event.clientX, event.clientY);
    if (!local) return;
    gestureRef.current = {
      tool: activeTool,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startTime: performance.now(),
      points: [local],
    };
    if (activeTool === "rectangle") setDraft({ tool: "rectangle", start: local, end: local });
    else if (activeTool === "freehand") setDraft({ tool: "freehand", points: [local] });
    setGestureActive(true);
  };

  // Tracked on `window` (not just the canvas) for the same reason the pan
  // drag above is — a fast drag that leaves the element mid-move shouldn't
  // silently abandon the gesture.
  useEffect(() => {
    if (!gestureActive) return;

    const handleMove = (event: MouseEvent) => {
      const gesture = gestureRef.current;
      if (!gesture) return;
      const local = canvasLocalPoint(event.clientX, event.clientY);
      if (!local) return;
      gesture.points.push(local);
      if (gesture.tool === "rectangle") {
        setDraft({ tool: "rectangle", start: gesture.points[0], end: local });
      } else if (gesture.tool === "freehand") {
        setDraft({ tool: "freehand", points: [...gesture.points] });
      }
    };

    const handleUp = (event: MouseEvent) => {
      const gesture = gestureRef.current;
      gestureRef.current = null;
      setDraft(null);
      setGestureActive(false);
      if (!gesture) return;

      const movedPx = Math.hypot(event.clientX - gesture.startClientX, event.clientY - gesture.startClientY);
      const elapsedMs = performance.now() - gesture.startTime;
      const isClick = movedPx <= CLICK_MAX_MOVEMENT_PX && elapsedMs <= CLICK_MAX_DURATION_MS;

      if (gesture.tool === "point") {
        if (!isClick) return; // a real drag, not a click — no stray point
        const point = canvasPointToNormalized(gesture.points[0], canvasSize, zoom, pan);
        commitAnnotation({ id: nextAnnotationId(), tool: "point", point });
        return;
      }

      if (gesture.tool === "text") {
        if (!isClick) return;
        const label = window.prompt("Label text:")?.trim();
        if (!label) return;
        const point = canvasPointToNormalized(gesture.points[0], canvasSize, zoom, pan);
        commitAnnotation({ id: nextAnnotationId(), tool: "text", point, text: label });
        return;
      }

      if (gesture.tool === "rectangle") {
        if (isClick) return; // negligible drag — avoid a degenerate zero-size rectangle
        const start = canvasPointToNormalized(gesture.points[0], canvasSize, zoom, pan);
        const end = canvasPointToNormalized(gesture.points[gesture.points.length - 1], canvasSize, zoom, pan);
        commitAnnotation({ id: nextAnnotationId(), tool: "rectangle", start, end });
        return;
      }

      if (gesture.tool === "freehand") {
        if (isClick || gesture.points.length < 2) return; // negligible drag — avoid a degenerate 1-point line
        const points = gesture.points.map((p) => canvasPointToNormalized(p, canvasSize, zoom, pan));
        commitAnnotation({ id: nextAnnotationId(), tool: "freehand", points });
      }
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [gestureActive, canvasSize, zoom, pan, commitAnnotation]);

  // Export: composites the CURRENT video frame + every placed annotation
  // onto a fresh offscreen canvas and downloads it as a PNG. Deliberately
  // NOT a video export — this repo has no video-encoding dependency
  // (ffmpeg.wasm or similar) and adding one would be a heavy addition this
  // bandwidth-conscious stack doesn't take on lightly (see CLAUDE.md's
  // stack section). A single annotated snapshot image is the real,
  // in-scope deliverable.
  const handleExport = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    // Always the video's own native decode resolution (falling back to the
    // overlay canvas's measured size only if that's somehow unavailable,
    // e.g. before 'loadedmetadata' has fired) — export composites the
    // WHOLE current frame, never just the currently-zoomed-in crop of it.
    // The zoom/pan viewport is a viewing aid, not a definition of "the
    // current frame."
    const exportWidth = video.videoWidth || canvasSize.width;
    const exportHeight = video.videoHeight || canvasSize.height;
    if (exportWidth <= 0 || exportHeight <= 0) return;

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = exportWidth;
    exportCanvas.height = exportHeight;
    const ctx = exportCanvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, exportWidth, exportHeight);

    // Replay every annotation at its normalized position scaled directly to
    // the export canvas's resolution — deliberately NOT normalizedToCanvasPoint
    // (that function's zoom/pan forward-projection is for the on-screen
    // overlay canvas specifically; the export canvas has no zoom/pan of its
    // own, u/v maps straight to pixels).
    for (const annotation of annotations) {
      drawAnnotationShape(ctx, annotation, (point) => ({
        x: point.u * exportWidth,
        y: point.v * exportHeight,
      }));
    }

    exportCanvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `video-annotation-${Date.now()}.png`;
      link.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }, [annotations, canvasSize]);

  return (
    <div className={cx("relative flex h-full w-full flex-col overflow-hidden rounded-xl bg-black", className)}>
      <div ref={containerRef} className="relative min-h-0 flex-1 overflow-hidden">
        <div
          className="h-full w-full"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "center center",
            cursor: zoomedIn ? (dragging ? "grabbing" : "grab") : "default",
          }}
          onMouseDown={handlePanStart}
        >
          <video
            ref={videoRef}
            className="h-full w-full object-contain"
            poster={poster}
            playsInline
            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            onLoadedMetadata={(e) => {
              setDuration(e.currentTarget.duration);
              measureCanvasSize();
            }}
            onDurationChange={(e) => setDuration(e.currentTarget.duration)}
            onPlay={() => setPaused(false)}
            onPause={() => setPaused(true)}
          />
        </div>

        {/* Drawing overlay — see this file's header comment for why this is
            a sibling of the transformed wrapper above (not a child of it)
            and how normalizedToCanvasPoint/canvasPointToNormalized keep it
            aligned across zoom/pan. `pointer-events-none` whenever no draw
            tool is active, so a drag falls straight through to the pan
            wrapper's own onMouseDown above with zero change in behavior —
            this is what makes panning structurally unable to leave a stray
            annotation, not just the click-vs-drag threshold below. */}
        <canvas
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          aria-label="Annotation drawing surface"
          className={cx(
            "absolute inset-0 h-full w-full",
            activeTool ? "cursor-crosshair" : "pointer-events-none",
          )}
          onMouseDown={handleCanvasMouseDown}
        />

        {/* Annotation tool panel — mode-switcher toolbar (point/rectangle/
            freehand/text) + a legend/list panel of placed annotations with
            a per-row delete button. Styled with the exact same design
            tokens and layout as components/LayerViewer/LayerViewer.tsx's
            AnnotationLayer toolbar (bg-surface/90, border-border,
            rounded-xl, backdrop-blur, the pill-button active/inactive
            classes) — the closest existing visual precedent in this repo
            for exactly this "toolbar + legend" shape. */}
        <div className="pointer-events-none absolute inset-0">
          <div className="pointer-events-auto absolute left-3 top-3 flex max-h-[60vh] w-56 min-h-0 flex-col gap-2 overflow-y-auto rounded-xl border border-border bg-surface/90 p-3 text-xs text-foreground shadow-lg backdrop-blur">
            <span className="font-medium">Annotate</span>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Annotation drawing tool">
              {TOOL_ORDER.map((tool) => (
                <button
                  key={tool}
                  type="button"
                  onClick={() => handleToolClick(tool)}
                  aria-pressed={activeTool === tool}
                  className={cx(
                    "rounded-full border px-2 py-1 text-[11px] font-medium transition-colors",
                    activeTool === tool
                      ? "border-accent bg-accent text-white"
                      : "border-border text-foreground hover:border-accent hover:text-accent",
                  )}
                >
                  {TOOL_LABELS[tool]}
                </button>
              ))}
            </div>
            {activeTool && <span className="text-accent">{TOOL_HINTS[activeTool]}</span>}
            {annotations.length === 0 ? (
              <span className="text-muted">No annotations yet</span>
            ) : (
              <ul aria-label="Placed annotations" className="flex flex-col gap-1 text-muted">
                {annotations.map((annotation) => (
                  <li key={annotation.id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate capitalize text-foreground">
                      {annotation.tool === "text" ? `Label: ${annotation.text}` : annotation.tool}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteAnnotation(annotation.id)}
                      aria-label={`Delete ${annotation.tool} annotation`}
                      className="shrink-0 text-foreground underline decoration-dotted underline-offset-2 hover:text-accent"
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Controls bar — themed via this repo's design tokens
          (bg-surface/border-border/text-foreground/text-accent from
          app/globals.css), matching TourStage's/Model3D's on-canvas
          control-panel visual language. */}
      <div className="flex flex-col gap-2 border-t border-border bg-surface/95 p-3 text-sm text-foreground backdrop-blur">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={togglePlay}
            aria-label={paused ? "Play" : "Pause"}
            className="rounded-full border border-border px-3 py-1 font-medium text-foreground transition-colors hover:border-accent hover:text-accent"
          >
            {paused ? "Play" : "Pause"}
          </button>

          <span className="tabular-nums text-muted">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          <input
            type="range"
            aria-label="Seek"
            min={0}
            max={duration || 0}
            step={0.01}
            value={Math.min(currentTime, duration || 0)}
            onChange={handleSeek}
            style={{ accentColor: "var(--color-accent)" }}
            className="flex-1 cursor-pointer"
          />

          <button
            type="button"
            onClick={handleExport}
            className="rounded-full border border-border px-3 py-1 font-medium text-foreground transition-colors hover:border-accent hover:text-accent"
          >
            Export snapshot
          </button>
        </div>

        <div className="flex items-center gap-3">
          <label htmlFor="video-annotator-zoom" className="font-medium text-muted">
            Zoom
          </label>
          <input
            id="video-annotator-zoom"
            type="range"
            aria-label="Zoom"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={ZOOM_STEP}
            value={zoom}
            onChange={handleZoomChange}
            style={{ accentColor: "var(--color-accent)" }}
            className="flex-1 cursor-pointer"
          />
          <span className="w-12 tabular-nums text-muted">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            onClick={handleResetZoom}
            disabled={zoom === MIN_ZOOM && pan.x === 0 && pan.y === 0}
            className="rounded-full border border-border px-3 py-1 font-medium text-foreground transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reset zoom
          </button>
        </div>
      </div>
    </div>
  );
}
