import type { Tour, TourEdge, TourRoom } from "@/lib/tour-types";

// Pure, DOM-free helpers extracted out of TourBuilder.tsx so the room-graph
// editing logic is unit-testable without rendering anything — same
// extraction precedent as components/FileList/file-list-utils.ts and
// components/VoxelTerrain/voxel-geometry.ts.

/** Builds a fresh, empty room at a click position. Deliberately gives
 *  `still` an empty string (not a placeholder) — TourRoom.still is required
 *  ("Always provide one" per lib/tour-types.ts), so an empty value is a
 *  real, surfaced validation gap rather than a silently-wrong placeholder. */
export function createRoom(id: string, pos: [number, number]): TourRoom {
  return { id, label: "", spin: null, still: "", pos, neighbors: [] };
}

/** First unused "room-N" id, so clicking the floorplan always produces a
 *  unique room without the author having to type an id up front. */
export function nextRoomId(existing: TourRoom[]): string {
  const used = new Set(existing.map((r) => r.id));
  let n = existing.length + 1;
  while (used.has(`room-${n}`)) n++;
  return `room-${n}`;
}

export function createEdge(to: string): TourEdge {
  return { to, clip: null };
}

export interface ValidationIssue {
  message: string;
}

/** Real, structural validation against the actual Tour shape this builder
 *  produces — not just "are the required fields non-empty" but also "does
 *  every doorway point at a room that actually exists" and "is startRoom a
 *  real room id", since a manifest failing either of those would break
 *  <VideoTour> at runtime (dangling edge / undefined start node) rather
 *  than fail loudly here at authoring time. */
export function validateTour(tour: Tour): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!tour.slug.trim()) issues.push({ message: "Slug is required." });
  if (!tour.title.trim()) issues.push({ message: "Title is required." });
  if (tour.rooms.length === 0) {
    issues.push({ message: "Add at least one room (click the floorplan to place one)." });
  }

  const ids = new Set(tour.rooms.map((r) => r.id));
  if (!tour.startRoom || !ids.has(tour.startRoom)) {
    issues.push({ message: "Start room must be set to one of the tour's rooms." });
  }

  for (const room of tour.rooms) {
    const name = room.label.trim() || room.id;
    if (!room.label.trim()) issues.push({ message: `Room "${room.id}" needs a label.` });
    if (!room.still.trim()) issues.push({ message: `Room "${name}" needs a still image.` });
    for (const edge of room.neighbors) {
      if (!ids.has(edge.to)) {
        issues.push({ message: `Room "${name}" has a doorway to unknown room "${edge.to}".` });
      }
    }
  }

  return issues;
}

/** Serializes a builder Tour as pretty-printed JSON — the same shape
 *  <VideoTour manifest={...}> consumes directly, or a real tour.json file. */
export function tourToJson(tour: Tour): string {
  return JSON.stringify(tour, null, 2);
}
