"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type { TourRoom } from "@/lib/tour-types";
import { cx } from "./cx";

const PLAYBACK_SPEEDS = [0.5, 1, 1.5, 2] as const;

/** mm:ss for the scrub bar's time readout. NaN/Infinity (duration unknown
 *  before 'loadedmetadata', or a still-loading video) render as "0:00"
 *  rather than "NaN:NaN". */
function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Real play/pause/scrub/speed controls for the `spin` video ONLY — never the
 * transition `clip` video (see the transition branch below, and
 * videotour-real-controls-and-sample-clip's story doc for the full
 * deadlock-risk rationale: `VideoTour.go()`'s only path to `arrive()` is the
 * transition clip's `onEnded`, so giving a user pause/scrub control over
 * THAT element could permanently lock the tour with no escape hatch. The
 * spin video has no such dependency — nothing in the navigation state
 * machine waits on it — so it's safe to control freely).
 *
 * Owns its own play/pause/mute/time/speed state, reset whenever the room
 * changes (the parent renders this with `key={room.id}`, so a room change
 * fully remounts it — see the effect below, which mirrors that reset for the
 * plain-state fields a remount alone wouldn't need but keeps explicit for
 * clarity). Still autoplays muted on arrival (unregressed silent-loop
 * behavior for anyone who doesn't touch the controls) — this component only
 * adds the ability to change that state, it doesn't change the default.
 */
function SpinVideo({ room, poster }: { room: TourRoom; poster?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);

  // Belt-and-suspenders reset alongside the parent's `key={room.id}` remount
  // — see the doc comment above.
  useEffect(() => {
    setPaused(false);
    setMuted(true);
    setCurrentTime(0);
    setDuration(0);
    setRate(1);
  }, [room.id]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    // Driven by our own `paused` state (what the button currently labels
    // itself), not a fresh read of `video.paused` — the two can legitimately
    // disagree for a brief instant right after mount (autoplay's `play()`
    // request is async; `video.paused` stays `true` in the DOM until it
    // resolves, while this component optimistically assumes autoplay will
    // succeed). Deciding off `video.paused` there would risk calling
    // `play()` again on a button that says "Pause", a real (if narrow) bug.
    if (paused) {
      // play() returns a Promise that can reject (e.g. autoplay-policy
      // races) — swallow it rather than let it surface as an unhandled
      // rejection; onPlay/onPause below are the actual source of truth for
      // `paused` state once the request settles, not this call succeeding.
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  };

  const handleSeek = (event: ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    const value = Number(event.target.value);
    if (video) video.currentTime = value;
    setCurrentTime(value);
  };

  const handleSpeed = (speed: number) => {
    const video = videoRef.current;
    if (video) video.playbackRate = speed;
    setRate(speed);
  };

  return (
    <>
      <video
        key={room.id}
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
        src={room.spin ?? undefined}
        poster={poster}
        autoPlay
        loop
        muted
        playsInline
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
      />

      {/* Controls bar — spin video only, themed via this repo's design
          tokens (bg-surface/border-border/text-foreground/text-accent from
          app/globals.css), matching Model3D's/VoxelTerrain's on-canvas
          legend-panel visual language. Positioned top-left: the bottom band
          is already claimed by the room-label caption (inset-x-0 bottom-0),
          DoorwayControls (inset-x-0 bottom-20, VideoTour.tsx), and the
          FloorPlanMap minimap (right-3 top-3, VideoTour.tsx) — top-left is
          the one corner nothing else in <VideoTour> renders into. */}
      <div className="absolute left-3 top-3 flex w-64 max-w-[calc(100%-1.5rem)] flex-col gap-2 rounded-xl border border-border bg-surface/90 p-2 text-xs text-foreground shadow-lg backdrop-blur sm:p-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={togglePlay}
            aria-label={paused ? "Play" : "Pause"}
            className="rounded-full border border-border px-2 py-1 font-medium text-foreground transition-colors hover:border-accent hover:text-accent"
          >
            {paused ? "Play" : "Pause"}
          </button>
          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? "Unmute" : "Mute"}
            className="rounded-full border border-border px-2 py-1 font-medium text-foreground transition-colors hover:border-accent hover:text-accent"
          >
            {muted ? "Unmute" : "Mute"}
          </button>
          <span className="tabular-nums text-muted">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>

        <input
          type="range"
          aria-label="Seek"
          min={0}
          max={duration || 0}
          step={0.01}
          value={Math.min(currentTime, duration || 0)}
          onChange={handleSeek}
          style={{ accentColor: "var(--color-accent)" }}
          className="w-full cursor-pointer"
        />

        <div className="flex items-center gap-1" role="group" aria-label="Playback speed">
          {PLAYBACK_SPEEDS.map((speed) => (
            <button
              key={speed}
              type="button"
              onClick={() => handleSpeed(speed)}
              aria-pressed={rate === speed}
              className={cx(
                "rounded-full border px-2 py-1 font-medium transition-colors",
                rate === speed
                  ? "border-accent bg-accent text-white"
                  : "border-border text-foreground hover:border-accent hover:text-accent",
              )}
            >
              {speed}x
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

/** An in-flight navigation, as rendered by TourStage's overlay.
 *  clipUrl set -> P2: play the real transition clip full-frame, call
 *  onTransitionClipEnded when it fires 'ended'. clipUrl null -> P1: show
 *  the timed "flying to {label}..." wipe (VideoTour owns the ~900ms timer). */
export interface TourTransition {
  label: string;
  clipUrl: string | null;
}

export interface TourStageProps {
  /** the room currently being displayed */
  room: TourRoom;
  /** poster shown while the room's media loads */
  poster?: string;
  /** the in-flight transition overlay, or null when idle */
  transition: TourTransition | null;
  /** P2: fires when a transition clip's <video> reaches 'ended'. Unused
   *  in P1 since no manifest edge sets `clip` yet — the branch exists so
   *  the wiring is real, not a stub. */
  onTransitionClipEnded?: () => void;
  className?: string;
}

/**
 * Renders the current room: the looping `spin` clip when the manifest sets
 * one (P2, now real and user-controlled — see `<SpinVideo>` above), otherwise
 * the `still` with a slow Ken-Burns zoom/pan (P1 — see `.videotour-kenburns`
 * in app/globals.css: ~14s, scale 1.02 -> 1.14 + a slight translate, matching
 * the prototype's `.live` treatment). A caption shows the room label. During
 * navigation, a transition overlay sits on top: either the real clip (P2,
 * still autoplay/muted/no-controls by design — see the branch below) or the
 * timed wipe (P1).
 */
export function TourStage({
  room,
  poster,
  transition,
  onTransitionClipEnded,
  className,
}: TourStageProps) {
  return (
    <div className={cx("relative h-full w-full overflow-hidden bg-black", className)}>
      {room.spin ? (
        // P2: looping 360 spin clip, now real content with real user
        // controls (play/pause/scrub/speed — see <SpinVideo> above). Safe to
        // control freely: nothing in VideoTour's navigation state machine
        // waits on this element (unlike the transition clip below).
        <SpinVideo room={room} poster={poster} />
      ) : (
        <img
          key={room.id}
          className="videotour-kenburns absolute inset-0 h-full w-full object-cover"
          src={room.still}
          alt={room.label}
        />
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 pt-10">
        <p className="text-lg font-medium text-white drop-shadow">{room.label}</p>
      </div>

      {transition &&
        (transition.clipUrl ? (
          // P2: real transition clip, full-frame. Arrives on 'ended'.
          // DELIBERATELY NO user controls (no play/pause, no scrub, no
          // speed) — out of scope for videotour-real-controls-and-sample-clip
          // by design, not an oversight. VideoTour.go()'s only path to
          // arrive() (which un-disables every DoorwayControls/FloorPlanMap
          // button) is this element's 'ended' event; pause or backward-scrub
          // control here would let 'ended' never fire, permanently locking
          // the tour with no escape hatch. Still unexercised against real
          // clip content too (no manifest edge sets `clip` yet) — that's
          // this story's spin-only sample-clip scope, not a separate gap.
          <video
            className="absolute inset-0 h-full w-full object-cover"
            src={transition.clipUrl}
            autoPlay
            muted
            playsInline
            onEnded={onTransitionClipEnded}
          />
        ) : (
          <div
            className="videotour-wipe absolute inset-0 flex items-center justify-center bg-black text-white"
            role="status"
            aria-live="polite"
          >
            <p className="text-lg">flying to {transition.label}…</p>
          </div>
        ))}
    </div>
  );
}
