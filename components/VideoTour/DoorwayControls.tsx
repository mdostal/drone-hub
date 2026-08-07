"use client";

import type { TourEdge, TourRoom } from "@/lib/tour-types";
import { cx } from "./cx";

export interface DoorwayControlsProps {
  /** the current room's outgoing edges — one button each */
  edges: TourEdge[];
  /** full room list, used to resolve a target room's label when the edge
   *  doesn't override one */
  rooms: TourRoom[];
  /** navigate via this edge — same go() path FloorPlanMap uses */
  onNavigate: (edge: TourEdge) => void;
  /** true while a navigation is in flight (busy-guard) — buttons disable */
  disabled?: boolean;
  className?: string;
}

/** One button per doorway out of the current room. */
export function DoorwayControls({
  edges,
  rooms,
  onNavigate,
  disabled = false,
  className,
}: DoorwayControlsProps) {
  if (edges.length === 0) return null;

  return (
    <div
      className={cx(
        "pointer-events-auto absolute inset-x-0 bottom-20 flex flex-wrap justify-center gap-2 px-4",
        className,
      )}
    >
      {edges.map((edge) => {
        const label = edge.label ?? rooms.find((r) => r.id === edge.to)?.label ?? edge.to;
        return (
          <button
            key={edge.to}
            type="button"
            disabled={disabled}
            onClick={() => onNavigate(edge)}
            className={cx(
              "rounded-full border border-white/40 bg-black/50 px-4 py-2 text-sm text-white backdrop-blur transition",
              disabled ? "cursor-not-allowed opacity-50" : "hover:bg-black/70",
            )}
          >
            → {label}
          </button>
        );
      })}
    </div>
  );
}
