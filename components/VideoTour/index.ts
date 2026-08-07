export { VideoTour } from "./VideoTour";
export { TourStage } from "./TourStage";
export type { TourStageProps, TourTransition } from "./TourStage";
export { DoorwayControls } from "./DoorwayControls";
export type { DoorwayControlsProps } from "./DoorwayControls";
export { FloorPlanMap } from "./FloorPlanMap";
export type { FloorPlanMapProps } from "./FloorPlanMap";

// Re-export the manifest types consumers need to build a Tour or type
// VideoTour's props, so importers don't also need to reach into lib/.
export type {
  Tour,
  TourEdge,
  TourRoom,
  VideoTourProps,
  RoomChangeHandler,
} from "@/lib/tour-types";
