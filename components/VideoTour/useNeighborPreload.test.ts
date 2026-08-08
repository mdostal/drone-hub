// Tests for the neighbor-preload mechanism, written from
// .pHive/epics/video-tour/stories/video-tour-neighbor-preload.yaml's
// acceptance criteria BEFORE the implementation exists (TDD per
// hive.config.yaml's rule for complex logic units). Fixtures below are
// synthetic — deliberately NOT the real Prado manifest — so the
// clip/spin/still branching can be exercised even though P1 data never
// sets spin/clip.
//
// Contract under test (per the story):
//   - the current room's direct (1-hop) neighbors get their media preloaded
//     on render
//   - the preload window rolls forward on navigation (new room -> new
//     room's neighbors preloaded, not just the start room's)
//   - a dead-end room (no neighbors) preloads nothing and never throws
//   - the mechanism is written against a clip|spin|still branch, not
//     stills-only, so P2 media needs no structural rework
//   - no recursive/2-hop preloading (do_not)

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import type { Tour, TourEdge, TourRoom } from "@/lib/tour-types";

// Imports resolved by name only, ahead of the implementation existing —
// this is what makes the "run before implementing" step in TDD real: this
// file must fail to even import until useNeighborPreload.ts exists.
import {
  useNeighborPreload,
  resolveNeighborPreloadTarget,
  preloadMedia,
  type PreloadTarget,
} from "./useNeighborPreload";

function room(overrides: Partial<TourRoom> & Pick<TourRoom, "id">): TourRoom {
  return {
    id: overrides.id,
    label: overrides.label ?? overrides.id,
    spin: overrides.spin ?? null,
    still: overrides.still ?? `https://example.test/${overrides.id}/still.jpg`,
    pos: overrides.pos ?? [0, 0],
    neighbors: overrides.neighbors ?? [],
  };
}

function edge(to: string, overrides: Partial<TourEdge> = {}): TourEdge {
  return { to, clip: overrides.clip ?? null, label: overrides.label };
}

function tourOf(rooms: TourRoom[], startRoom = rooms[0].id): Tour {
  return {
    slug: "synthetic-fixture",
    title: "Synthetic Fixture House",
    startRoom,
    rooms,
  };
}

// --- fake Image() so preloadMedia's image branch is observable without a
// real network fetch. jsdom's real Image would work too, but a bare fake
// keeps the assertion focused on "was .src set to the right url" rather
// than on image-decode plumbing this story doesn't care about. ---
class FakeImage {
  src = "";
}
let createdImages: FakeImage[] = [];

beforeEach(() => {
  createdImages = [];
  // A plain class (not vi.fn().mockImplementation(() => ...)) because the
  // implementation calls `new Image()`, and an arrow-function mock
  // implementation can't be invoked with `new`.
  vi.stubGlobal(
    "Image",
    class {
      src = "";
      constructor() {
        createdImages.push(this as unknown as FakeImage);
      }
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.querySelectorAll("link[data-neighbor-preload]").forEach((el) => el.remove());
});

function preloadedVideoUrls(): string[] {
  return Array.from(document.head.querySelectorAll('link[rel="preload"][as="video"]')).map(
    (el) => el.getAttribute("href") ?? "",
  );
}

function preloadedImageUrls(): string[] {
  return createdImages.map((img) => img.src);
}

describe("resolveNeighborPreloadTarget (pure branch logic)", () => {
  it("resolves to the neighbor's still image when neither clip nor spin is set (P1)", () => {
    const target = resolveNeighborPreloadTarget(
      edge("kitchen"),
      room({ id: "kitchen", still: "https://example.test/kitchen-still.jpg" }),
    );
    expect(target).toEqual<PreloadTarget>({
      url: "https://example.test/kitchen-still.jpg",
      kind: "image",
    });
  });

  it("resolves to the neighbor room's spin clip when set and the edge has no transition clip (P2, structural)", () => {
    const target = resolveNeighborPreloadTarget(
      edge("kitchen"),
      room({ id: "kitchen", spin: "https://example.test/kitchen-spin.mp4" }),
    );
    expect(target).toEqual<PreloadTarget>({
      url: "https://example.test/kitchen-spin.mp4",
      kind: "video",
    });
  });

  it("resolves to the edge's outgoing transition clip when set, even if the neighbor also has a spin (P2, structural)", () => {
    const target = resolveNeighborPreloadTarget(
      edge("kitchen", { clip: "https://example.test/to-kitchen.mp4" }),
      room({ id: "kitchen", spin: "https://example.test/kitchen-spin.mp4" }),
    );
    expect(target).toEqual<PreloadTarget>({
      url: "https://example.test/to-kitchen.mp4",
      kind: "video",
    });
  });
});

describe("preloadMedia (side-effect primitive)", () => {
  it("preloads an image target via new Image().src", () => {
    preloadMedia({ url: "https://example.test/a-still.jpg", kind: "image" });
    expect(preloadedImageUrls()).toEqual(["https://example.test/a-still.jpg"]);
    expect(preloadedVideoUrls()).toEqual([]);
  });

  it("preloads a video target via an injected <link rel=preload as=video>", () => {
    preloadMedia({ url: "https://example.test/a-clip.mp4", kind: "video" });
    expect(preloadedVideoUrls()).toEqual(["https://example.test/a-clip.mp4"]);
    expect(preloadedImageUrls()).toEqual([]);
  });
});

describe("useNeighborPreload (wired into room render)", () => {
  it("preloads the still images of all direct neighbors when the current room renders", () => {
    const kitchen = room({ id: "kitchen", still: "https://example.test/kitchen.jpg" });
    const hall = room({ id: "hall", still: "https://example.test/hall.jpg" });
    const living = room({
      id: "living",
      still: "https://example.test/living.jpg",
      neighbors: [edge("kitchen"), edge("hall")],
    });
    const tour = tourOf([living, kitchen, hall], "living");

    renderHook(() => useNeighborPreload(tour, living));

    expect(preloadedImageUrls().sort()).toEqual(
      ["https://example.test/kitchen.jpg", "https://example.test/hall.jpg"].sort(),
    );
  });

  it("rolls the preload window forward on navigation instead of only preloading the start room's neighbors", () => {
    const attic = room({ id: "attic", still: "https://example.test/attic.jpg" });
    const kitchen = room({
      id: "kitchen",
      still: "https://example.test/kitchen.jpg",
      neighbors: [edge("attic")],
    });
    const hall = room({
      id: "hall",
      still: "https://example.test/hall.jpg",
      neighbors: [edge("kitchen")],
    });
    const living = room({
      id: "living",
      still: "https://example.test/living.jpg",
      neighbors: [edge("hall")],
    });
    const tour = tourOf([living, hall, kitchen, attic], "living");

    const { rerender } = renderHook(({ room: r }) => useNeighborPreload(tour, r), {
      initialProps: { room: living },
    });

    // Start room (living)'s only neighbor is hall.
    expect(preloadedImageUrls()).toEqual(["https://example.test/hall.jpg"]);

    // Navigate to hall -> its neighbor (kitchen) should now preload too,
    // not just living's original neighbor set.
    rerender({ room: hall });
    expect(preloadedImageUrls()).toContain("https://example.test/kitchen.jpg");

    // Navigate again to kitchen -> its neighbor (attic) preloads. This also
    // proves no 2-hop/recursive preloading happened earlier: attic only
    // shows up once we're actually in kitchen, not back when we were in
    // living or hall.
    rerender({ room: kitchen });
    expect(preloadedImageUrls()).toContain("https://example.test/attic.jpg");
  });

  it("does not preload beyond direct (1-hop) neighbors", () => {
    const attic = room({ id: "attic", still: "https://example.test/attic.jpg" });
    const kitchen = room({
      id: "kitchen",
      still: "https://example.test/kitchen.jpg",
      neighbors: [edge("attic")],
    });
    const living = room({
      id: "living",
      still: "https://example.test/living.jpg",
      neighbors: [edge("kitchen")],
    });
    const tour = tourOf([living, kitchen, attic], "living");

    renderHook(() => useNeighborPreload(tour, living));

    // Only the direct neighbor (kitchen) preloads; the 2-hop room (attic)
    // must not.
    expect(preloadedImageUrls()).toEqual(["https://example.test/kitchen.jpg"]);
  });

  it("does not error and preloads nothing for a dead-end room with no neighbors", () => {
    const deadEnd = room({ id: "closet", still: "https://example.test/closet.jpg", neighbors: [] });
    const tour = tourOf([deadEnd], "closet");

    expect(() => renderHook(() => useNeighborPreload(tour, deadEnd))).not.toThrow();
    expect(preloadedImageUrls()).toEqual([]);
    expect(preloadedVideoUrls()).toEqual([]);
  });

  it("preloads a mix of clip/spin/still neighbors per the clip|null branch, not stills-only (P2 structural)", () => {
    // still-only neighbor (P1 today)
    const bedroom = room({ id: "bedroom", still: "https://example.test/bedroom.jpg" });
    // neighbor with its own spin clip, edge has no transition clip
    const kitchen = room({ id: "kitchen", spin: "https://example.test/kitchen-spin.mp4" });
    // neighbor reached via an edge that itself has a transition clip
    const attic = room({ id: "attic", still: "https://example.test/attic.jpg" });

    const hub = room({
      id: "hub",
      still: "https://example.test/hub.jpg",
      neighbors: [
        edge("bedroom"),
        edge("kitchen"),
        edge("attic", { clip: "https://example.test/to-attic.mp4" }),
      ],
    });
    const tour = tourOf([hub, bedroom, kitchen, attic], "hub");

    renderHook(() => useNeighborPreload(tour, hub));

    expect(preloadedImageUrls()).toEqual(["https://example.test/bedroom.jpg"]);
    expect(preloadedVideoUrls().sort()).toEqual(
      ["https://example.test/kitchen-spin.mp4", "https://example.test/to-attic.mp4"].sort(),
    );
  });

  it("does nothing when there is no room (loading/error state)", () => {
    expect(() => renderHook(() => useNeighborPreload(null, null))).not.toThrow();
    expect(preloadedImageUrls()).toEqual([]);
    expect(preloadedVideoUrls()).toEqual([]);
  });
});
