// Public export surface for <TourBuilder> — import from
// "@/components/TourBuilder". Produces a `Tour` (lib/tour-types.ts) — the
// exact manifest shape <VideoTour> consumes.
export { TourBuilder } from "./TourBuilder";
export type { TourBuilderProps } from "./TourBuilder";
export { createEdge, createRoom, nextRoomId, tourToJson, validateTour } from "./tour-builder-utils";
export type { ValidationIssue } from "./tour-builder-utils";

export type { Tour, TourEdge, TourRoom } from "@/lib/tour-types";
