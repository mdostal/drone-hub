"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Tour, TourEdge, VideoTourProps } from "@/lib/tour-types";
import { TourStage, type TourTransition } from "./TourStage";
import { DoorwayControls } from "./DoorwayControls";
import { FloorPlanMap } from "./FloorPlanMap";
import { useNeighborPreload } from "./useNeighborPreload";
import { cx } from "./cx";

// Arrive-after-transition delay, matching the prototype's go():
//   var arrive=function(){ trans.classList.remove('on'); render(n.to);
//     setTimeout(function(){busy=false;},250); };
// The wipe itself runs ~900ms (WIPE_MS below); this extra 250ms is the
// prototype's own post-arrival cooldown before the busy-guard releases.
const BUSY_COOLDOWN_MS = 250;
// Timed wipe duration when an edge has no transition clip (P1: every edge).
const WIPE_MS = 900;

/**
 * <VideoTour> — the interactive fly-through / video-Matterport. Owns the
 * room-graph navigation state machine ported from
 * docs/components/reference/prado-tour.prototype.html's render()/go():
 *
 *   go(edge): if busy, ignore. Otherwise set busy, show "flying to
 *   {label}..." (a timed wipe, or in P2 the real transition clip playing
 *   full-frame), then arrive: render the target room, clear busy shortly
 *   after.
 *
 * Gate-agnostic by design — this component has no knowledge of
 * middleware.ts / lib/gate.ts. It just renders whatever manifest it's given.
 */
export function VideoTour({
  manifest,
  startRoom,
  poster,
  onRoomChange,
  className,
}: VideoTourProps) {
  const [tour, setTour] = useState<Tour | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cur, setCur] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [transition, setTransition] = useState<
    (TourTransition & { onArrive: () => void }) | null
  >(null);

  // Synchronous busy-guard, matching the prototype's `if(busy) return;`
  // (React state updates aren't synchronous, so a plain `busy` state read
  // inside a rapid-fire click handler can't be trusted the way the
  // prototype's single-threaded `var busy` can — a ref stands in for it.)
  const busyRef = useRef(false);

  // Latest tour, read inside go() (a stable useCallback) without needing
  // `tour` in its dependency array.
  const tourRef = useRef<Tour | null>(null);
  useEffect(() => {
    tourRef.current = tour;
  }, [tour]);

  // Latest onRoomChange, read from an effect below without making that
  // effect re-fire just because the caller passed a new inline function.
  const onRoomChangeRef = useRef(onRoomChange);
  useEffect(() => {
    onRoomChangeRef.current = onRoomChange;
  }, [onRoomChange]);

  // Resolve the manifest: fetch if given a URL, use as-is if given a Tour.
  useEffect(() => {
    let cancelled = false;
    setLoadError(null);

    if (typeof manifest === "string") {
      setTour(null);
      fetch(manifest)
        .then((res) => {
          if (!res.ok) throw new Error(`Failed to load tour manifest (${res.status})`);
          return res.json() as Promise<Tour>;
        })
        .then((data) => {
          if (!cancelled) setTour(data);
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setLoadError(err instanceof Error ? err.message : String(err));
          }
        });
    } else {
      setTour(manifest);
    }

    return () => {
      cancelled = true;
    };
  }, [manifest]);

  // Arrive at the tour's (possibly overridden) start room once the
  // manifest resolves. Re-arms if the manifest or startRoom override
  // changes later.
  useEffect(() => {
    if (!tour) return;
    setCur(startRoom ?? tour.startRoom);
  }, [tour, startRoom]);

  // Fire onRoomChange on every arrival, including this initial one.
  useEffect(() => {
    if (cur === null) return;
    onRoomChangeRef.current?.(cur);
  }, [cur]);

  const room = useMemo(() => tour?.rooms.find((r) => r.id === cur) ?? null, [tour, cur]);

  // Preload the current room's direct neighbors' media (still now, spin/
  // transition clip in P2) — a pure side effect keyed off `room`, wired
  // through useNeighborPreload so navigation/busy-guard logic in go()
  // below stays untouched. Rolls forward automatically since `room`
  // changes on every arrival.
  useNeighborPreload(tour, room);

  const go = useCallback((edge: TourEdge) => {
    if (busyRef.current) return; // busy-guard: ignore clicks mid-navigation
    busyRef.current = true;
    setBusy(true);

    const label = edge.label ?? tourRef.current?.rooms.find((r) => r.id === edge.to)?.label ?? edge.to;

    const arrive = () => {
      setTransition(null);
      setCur(edge.to);
      window.setTimeout(() => {
        busyRef.current = false;
        setBusy(false);
      }, BUSY_COOLDOWN_MS);
    };

    if (edge.clip) {
      // P2: real transition-clip playback. Structural branch — unexercised
      // in P1 since no manifest edge sets `clip` yet. TourStage plays the
      // clip full-frame and calls `onArrive` (below) on the video's
      // 'ended' event via onTransitionClipEnded.
      setTransition({ label, clipUrl: edge.clip, onArrive: arrive });
    } else {
      setTransition({ label, clipUrl: null, onArrive: arrive });
      window.setTimeout(arrive, WIPE_MS);
    }
  }, []);

  if (loadError) {
    return (
      <div className={cx("flex h-full w-full items-center justify-center bg-black text-white", className)}>
        <p role="alert" className="text-sm">
          Couldn&apos;t load tour: {loadError}
        </p>
      </div>
    );
  }

  if (!tour || !room) {
    return (
      <div className={cx("relative flex h-full w-full items-center justify-center bg-black", className)}>
        {poster && (
          <img src={poster} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" />
        )}
        <p className="relative text-sm text-white">Loading tour…</p>
      </div>
    );
  }

  return (
    <div className={cx("relative h-full w-full", className)}>
      <TourStage
        room={room}
        poster={poster}
        transition={transition}
        onTransitionClipEnded={transition?.onArrive}
      />
      <DoorwayControls edges={room.neighbors} rooms={tour.rooms} onNavigate={go} disabled={busy} />
      {/* Wrapper positions the minimap in the stage's top-right corner.
          FloorPlanMap's own root stays `relative` (its default, needed so
          its absolutely-positioned nodes/lines have a positioning context)
          — overriding that with an `absolute` className here instead of on
          FloorPlanMap itself avoids two conflicting position utilities
          landing on the same element (an earlier version of this hit that
          bug: `relative` won the cascade over `absolute`, and the leftover
          top/right offsets then pushed the whole minimap off-screen). */}
      <div className="absolute right-3 top-3">
        <FloorPlanMap
          rooms={tour.rooms}
          currentRoomId={room.id}
          currentEdges={room.neighbors}
          onNavigate={go}
          disabled={busy}
        />
      </div>
    </div>
  );
}
