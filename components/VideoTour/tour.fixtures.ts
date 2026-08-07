// Shared synthetic `Tour` fixture for the VideoTour/TourStage/
// DoorwayControls/FloorPlanMap specs in this folder.
//
// Deliberately NOT public/tours/2806-prado/tour.json: a small, hand-built
// graph (a hub room with three neighbors, one of them a dead end) keeps
// assertions like "the current room's doorway list" and "the minimap
// highlight follows navigation" easy to reason about without depending on
// the real Prado house's shape. This mirrors the choice
// useNeighborPreload.test.ts already made (synthetic fixtures over the real
// manifest) for the same reason. The shape matches lib/tour-types.ts
// exactly, so this also doubles as a minimal example of a valid Tour.
import type { Tour, TourEdge, TourRoom } from "@/lib/tour-types";

export function makeRoom(
  overrides: Partial<TourRoom> & Pick<TourRoom, "id" | "label">,
): TourRoom {
  return {
    id: overrides.id,
    label: overrides.label,
    spin: overrides.spin ?? null,
    still: overrides.still ?? `https://example.test/${overrides.id}.jpg`,
    pos: overrides.pos ?? [50, 50],
    neighbors: overrides.neighbors ?? [],
  };
}

export function makeEdge(to: string, overrides: Partial<TourEdge> = {}): TourEdge {
  return { to, clip: overrides.clip ?? null, label: overrides.label };
}

/**
 * front (start) -- living -- kitchen
 *                     |
 *                   attic (dead end besides living)
 *
 * front has exactly one doorway (living); living is a 3-way hub (front,
 * kitchen, attic); kitchen and attic each only lead back to living.
 */
export function buildSyntheticTour(): Tour {
  const front = makeRoom({
    id: "front",
    label: "Front Exterior",
    pos: [50, 90],
    neighbors: [makeEdge("living")],
  });
  const living = makeRoom({
    id: "living",
    label: "Living Room",
    pos: [50, 60],
    neighbors: [makeEdge("front"), makeEdge("kitchen"), makeEdge("attic")],
  });
  const kitchen = makeRoom({
    id: "kitchen",
    label: "Kitchen",
    pos: [80, 40],
    neighbors: [makeEdge("living")],
  });
  const attic = makeRoom({
    id: "attic",
    label: "Attic",
    pos: [20, 20],
    neighbors: [makeEdge("living")],
  });

  return {
    slug: "synthetic-fixture-house",
    title: "Synthetic Fixture House",
    startRoom: "front",
    rooms: [front, living, kitchen, attic],
  };
}
