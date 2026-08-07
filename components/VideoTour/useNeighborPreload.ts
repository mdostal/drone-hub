"use client";

import { useEffect } from "react";
import type { Tour, TourEdge, TourRoom } from "@/lib/tour-types";

/**
 * Neighbor preloading — see docs/components/video-tour.md, behavior item 4:
 * "Preload the spin + outgoing-transition clips of the current node's
 * neighbors (snappy hops)."
 *
 * P1 has no real spin/transition clips yet (every Prado room/edge sets
 * `spin`/`clip` to null), so in practice this preloads neighbor still
 * images today. The resolution + preload primitives below are written
 * against the full `clip | spin | still` shape from the start so P2 (real
 * media) needs no structural rework here — only real URLs start flowing
 * through the already-wired `video` branches.
 *
 * Scope: direct (1-hop) neighbors only. No recursive/2-hop preloading —
 * that's out of scope per the story's do_not list.
 */

/** What kind of preload a resolved media URL needs. Images and video use
 *  different browser preload mechanisms (`new Image()` vs.
 *  `<link rel=preload as=video>`), so this stays a discriminated union
 *  instead of a single image-shaped API. */
export type PreloadKind = "image" | "video";

export interface PreloadTarget {
  url: string;
  kind: PreloadKind;
}

/**
 * Resolve what should be preloaded for one neighbor edge, in priority
 * order:
 *   1. the edge's own outgoing transition clip (`edge.clip`) — the clip
 *      that actually plays during the hop into this neighbor (P2).
 *   2. the neighbor room's looping spin clip (`neighborRoom.spin`) — what
 *      renders once you arrive (P2).
 *   3. the neighbor room's still fallback (`neighborRoom.still`) — always
 *      present, and P1's only populated field.
 *
 * Exported standalone (not inlined into the hook) so the branch logic is
 * unit-testable against synthetic clip/spin/still combinations without a
 * DOM.
 */
export function resolveNeighborPreloadTarget(
  edge: TourEdge,
  neighborRoom: TourRoom,
): PreloadTarget {
  if (edge.clip) {
    return { url: edge.clip, kind: "video" };
  }
  if (neighborRoom.spin) {
    return { url: neighborRoom.spin, kind: "video" };
  }
  return { url: neighborRoom.still, kind: "image" };
}

/**
 * Fire a single browser preload for a resolved target.
 *
 * - `image`: `new Image().src = url` — the standard trick to get the
 *   browser fetching/decoding an image ahead of it appearing in the DOM.
 * - `video`: an injected `<link rel="preload" as="video">` — `Image()`
 *   can't preload video, and a `<video>` element would start requesting
 *   data eagerly in ways we don't want for something that may never be
 *   navigated to. Deduped per URL via a `data-neighbor-preload` marker so
 *   re-renders don't pile up duplicate `<link>` tags in `<head>`.
 *
 * `doc` is injectable (defaults to `document`) purely so this stays
 * testable without relying on global mutation.
 */
export function preloadMedia(target: PreloadTarget, doc: Document = document): void {
  if (target.kind === "image") {
    const img = new Image();
    img.src = target.url;
    return;
  }

  const alreadyPreloaded = doc.head.querySelector(
    `link[data-neighbor-preload="${target.url}"]`,
  );
  if (alreadyPreloaded) return;

  const link = doc.createElement("link");
  // Set via attributes rather than the `.as`/`.rel` IDL properties: jsdom
  // (used by the test suite) doesn't reflect `HTMLLinkElement.as` as of
  // this writing, and attributes are what the browser actually reads for
  // preload prioritization regardless of environment.
  link.setAttribute("rel", "preload");
  link.setAttribute("as", "video");
  link.setAttribute("href", target.url);
  link.setAttribute("data-neighbor-preload", target.url);
  doc.head.appendChild(link);
}

/**
 * Preload the direct (1-hop) neighbors' media of `room`. Re-runs whenever
 * `room` changes, so the preload window rolls forward with navigation
 * (each arrival preloads its own neighbors, not just the tour's start
 * room). A room with no neighbors (a dead end) is a no-op.
 *
 * Intentionally a side-effect-only hook (no return value) — it's meant to
 * be called for its effect, wired off the same `room` state <VideoTour>
 * already derives, without participating in navigation/busy-guard logic.
 */
export function useNeighborPreload(tour: Tour | null, room: TourRoom | null): void {
  useEffect(() => {
    if (!room) return;

    for (const edge of room.neighbors) {
      const neighborRoom = tour?.rooms.find((r) => r.id === edge.to);
      if (!neighborRoom) continue; // defensive: malformed manifest edge
      preloadMedia(resolveNeighborPreloadTarget(edge, neighborRoom));
    }
  }, [tour, room]);
}
