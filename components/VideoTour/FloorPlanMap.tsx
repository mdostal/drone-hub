"use client";

import { useMemo } from "react";
import type { TourEdge, TourRoom } from "@/lib/tour-types";
import { cx } from "./cx";

export interface FloorPlanMapProps {
  /** every room in the tour, for node positions */
  rooms: TourRoom[];
  /** id of the room currently displayed — gets the `.here` highlight */
  currentRoomId: string;
  /** the current room's outgoing edges — these are the only nodes that are
   *  actually clickable, mirroring DoorwayControls (same go() path; a node
   *  with no edge from here is shown for orientation but isn't navigable) */
  currentEdges: TourEdge[];
  /** navigate via this edge — same go() path DoorwayControls uses */
  onNavigate: (edge: TourEdge) => void;
  /** true while a navigation is in flight (busy-guard) — nodes disable */
  disabled?: boolean;
  className?: string;
}

/** Schematic floor-plan minimap: nodes at room.pos [x%, y%], edges drawn
 *  between connected rooms, current room highlighted, reachable nodes
 *  clickable. */
export function FloorPlanMap({
  rooms,
  currentRoomId,
  currentEdges,
  onNavigate,
  disabled = false,
  className,
}: FloorPlanMapProps) {
  const roomsById = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);

  // Every doorway in the tour, deduped so a bidirectional pair (a->b, b->a)
  // draws one line instead of two overlapping ones.
  const lines = useMemo(() => {
    const seen = new Set<string>();
    const result: { key: string; from: TourRoom; to: TourRoom }[] = [];
    for (const room of rooms) {
      for (const edge of room.neighbors) {
        const target = roomsById.get(edge.to);
        if (!target) continue;
        const key = [room.id, target.id].sort().join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({ key, from: room, to: target });
      }
    }
    return result;
  }, [rooms, roomsById]);

  const edgeByTargetId = useMemo(
    () => new Map(currentEdges.map((edge) => [edge.to, edge])),
    [currentEdges],
  );

  return (
    <div
      className={cx(
        "pointer-events-auto relative aspect-square w-40 overflow-hidden rounded-md border border-white/30 bg-black/50 backdrop-blur",
        className,
      )}
      aria-label="Floor plan"
    >
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {lines.map(({ key, from, to }) => (
          <line
            key={key}
            x1={from.pos[0]}
            y1={from.pos[1]}
            x2={to.pos[0]}
            y2={to.pos[1]}
            stroke="rgba(255,255,255,0.35)"
            strokeWidth={1}
          />
        ))}
      </svg>

      {rooms.map((room) => {
        const isHere = room.id === currentRoomId;
        const edge = edgeByTargetId.get(room.id);
        const clickable = !isHere && !!edge;
        return (
          <button
            key={room.id}
            type="button"
            title={room.label}
            aria-label={room.label}
            aria-current={isHere ? "true" : undefined}
            disabled={!clickable || disabled}
            onClick={() => edge && onNavigate(edge)}
            className={cx(
              "absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border transition",
              isHere
                ? "here z-10 h-4 w-4 border-white bg-white"
                : clickable
                  ? "border-white/70 bg-white/40 hover:bg-white/70"
                  : "cursor-default border-white/30 bg-white/15",
            )}
            style={{ left: `${room.pos[0]}%`, top: `${room.pos[1]}%` }}
          />
        );
      })}
    </div>
  );
}
