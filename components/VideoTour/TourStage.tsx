"use client";

import type { TourRoom } from "@/lib/tour-types";
import { cx } from "./cx";

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
 * one (P2), otherwise the `still` with a slow Ken-Burns zoom/pan (P1 — see
 * `.videotour-kenburns` in app/globals.css: ~14s, scale 1.02 -> 1.14 + a
 * slight translate, matching the prototype's `.live` treatment). A caption
 * shows the room label. During navigation, a transition overlay sits on top:
 * either the real clip (P2) or the timed wipe (P1).
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
        // P2: looping 360 spin clip. Structural branch — unexercised in P1
        // since every Prado room has spin: null.
        <video
          key={room.id}
          className="absolute inset-0 h-full w-full object-cover"
          src={room.spin}
          poster={poster}
          autoPlay
          loop
          muted
          playsInline
        />
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
