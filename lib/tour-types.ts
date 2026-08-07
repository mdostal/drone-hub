// Typed schema for <VideoTour> — the interactive fly-through / video-Matterport.
// A tour is a room GRAPH: nodes (rooms) + directed edges (doorways).
// Stills + wipes are fallbacks so a tour is publishable before every clip is cut.

/** A directed doorway from one room to a neighbor. */
export interface TourEdge {
  /** target room id (must exist in Tour.rooms) */
  to: string;
  /** URL of the "drone flying from THIS room to `to`" transition clip.
   *  null → the player uses a timed cross-fade wipe instead. */
  clip: string | null;
  /** optional label override for the doorway button (defaults to target room's label) */
  label?: string;
}

/** A room = a node in the graph. */
export interface TourRoom {
  /** stable id, e.g. "kitchen" */
  id: string;
  /** display name, e.g. "Kitchen" */
  label: string;
  /** URL of the looping 360 "spin" clip for this room.
   *  null → the player shows `still` with a slow Ken-Burns as placeholder. */
  spin: string | null;
  /** fallback still image (data URI or URL). Always provide one. */
  still: string;
  /** minimap position as [x%, y%] within the floor-plan box (0–100). */
  pos: [number, number];
  /** doorways out of this room. */
  neighbors: TourEdge[];
}

/** A full tour manifest (one property). Ships as tour.json. */
export interface Tour {
  slug: string;                 // "2806-prado"
  title: string;                // "2806 Prado"
  startRoom: string;            // id of the entry node (e.g. "front")
  rooms: TourRoom[];
  /** optional: gate this tour until Mathew flips it public. */
  gated?: boolean;
  /** optional audio bed / narration URL (P3). */
  audio?: string | null;
}

export type RoomChangeHandler = (roomId: string) => void;

export interface VideoTourProps {
  /** manifest object or a URL to tour.json */
  manifest: Tour | string;
  /** override the tour's startRoom */
  startRoom?: string;
  /** poster shown while the first clip/still loads */
  poster?: string;
  /** fired on every arrival */
  onRoomChange?: RoomChangeHandler;
  className?: string;
}
