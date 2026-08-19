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

export interface VideoAnnotatorProps {
  /** mp4 (or any progressive format the browser plays natively) or m3u8 URL. */
  src: string;
  /** poster shown before playback starts / while the video loads. */
  poster?: string;
  className?: string;
}

/**
 * <VideoAnnotator> — player foundation: play/pause, a scrub bar, and a
 * zoom+pan viewport control. First of a three-part build (per this story's
 * scope) — drawing/annotation tools and export land in later passes on top
 * of this; deliberately not started here.
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
 */
export function VideoAnnotator({ src, poster, className }: VideoAnnotatorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [paused, setPaused] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [pan, setPan] = useState<Pan>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

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

  return (
    <div className={cx("relative flex h-full w-full flex-col overflow-hidden rounded-xl bg-black", className)}>
      <div className="relative min-h-0 flex-1 overflow-hidden">
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
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
            onDurationChange={(e) => setDuration(e.currentTarget.duration)}
            onPlay={() => setPaused(false)}
            onPause={() => setPaused(true)}
          />
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
