import { describe, expect, it } from "vitest";
import { createEdge, createRoom, nextRoomId, tourToJson, validateTour } from "./tour-builder-utils";
import type { Tour } from "@/lib/tour-types";

describe("createRoom", () => {
  it("creates a room with an empty (not placeholder) still, per TourRoom's required-field contract", () => {
    const room = createRoom("kitchen", [50, 50]);
    expect(room).toEqual({ id: "kitchen", label: "", spin: null, still: "", pos: [50, 50], neighbors: [] });
  });
});

describe("nextRoomId", () => {
  it("returns room-1 for an empty room list", () => {
    expect(nextRoomId([])).toBe("room-1");
  });

  it("skips ids already in use", () => {
    const existing = [createRoom("room-1", [0, 0]), createRoom("room-2", [0, 0])];
    expect(nextRoomId(existing)).toBe("room-3");
  });

  it("skips a used id even if it isn't contiguous with the list length", () => {
    const existing = [createRoom("room-5", [0, 0])];
    // existing.length + 1 = 2, but room-2 is free, so it should still return room-2
    expect(nextRoomId(existing)).toBe("room-2");
  });
});

describe("createEdge", () => {
  it("creates a doorway with no clip (wipe fallback) by default", () => {
    expect(createEdge("living")).toEqual({ to: "living", clip: null });
  });
});

function emptyTour(): Tour {
  return { slug: "", title: "", startRoom: "", rooms: [] };
}

describe("validateTour", () => {
  it("flags a fully-empty tour with every required-field issue", () => {
    const issues = validateTour(emptyTour());
    const messages = issues.map((i) => i.message);
    expect(messages).toContain("Slug is required.");
    expect(messages).toContain("Title is required.");
    expect(messages).toContain("Add at least one room (click the floorplan to place one).");
    expect(messages).toContain("Start room must be set to one of the tour's rooms.");
  });

  it("flags a room missing a label or still", () => {
    const tour: Tour = {
      slug: "test",
      title: "Test",
      startRoom: "room-1",
      rooms: [createRoom("room-1", [50, 50])],
    };
    const issues = validateTour(tour);
    const messages = issues.map((i) => i.message);
    expect(messages).toContain('Room "room-1" needs a label.');
    expect(messages).toContain('Room "room-1" needs a still image.');
  });

  it("flags a doorway pointing at a room that doesn't exist", () => {
    const room = { ...createRoom("room-1", [50, 50]), label: "Room 1", still: "room1.jpg", neighbors: [createEdge("ghost-room")] };
    const tour: Tour = { slug: "test", title: "Test", startRoom: "room-1", rooms: [room] };
    const issues = validateTour(tour);
    expect(issues.map((i) => i.message)).toContain('Room "Room 1" has a doorway to unknown room "ghost-room".');
  });

  it("returns no issues for a fully valid, minimal tour", () => {
    const room = { ...createRoom("room-1", [50, 50]), label: "Entry", still: "entry.jpg" };
    const tour: Tour = { slug: "demo", title: "Demo", startRoom: "room-1", rooms: [room] };
    expect(validateTour(tour)).toEqual([]);
  });

  it("passes for a valid multi-room tour with real doorways", () => {
    const a = { ...createRoom("a", [10, 10]), label: "A", still: "a.jpg", neighbors: [createEdge("b")] };
    const b = { ...createRoom("b", [90, 90]), label: "B", still: "b.jpg", neighbors: [createEdge("a")] };
    const tour: Tour = { slug: "demo", title: "Demo", startRoom: "a", rooms: [a, b] };
    expect(validateTour(tour)).toEqual([]);
  });
});

describe("tourToJson", () => {
  it("round-trips to the exact same structure through JSON.parse", () => {
    const room = { ...createRoom("a", [10, 10]), label: "A", still: "a.jpg" };
    const tour: Tour = { slug: "demo", title: "Demo", startRoom: "a", rooms: [room] };
    expect(JSON.parse(tourToJson(tour))).toEqual(tour);
  });

  it("pretty-prints with 2-space indentation", () => {
    const tour: Tour = { slug: "demo", title: "Demo", startRoom: "a", rooms: [] };
    expect(tourToJson(tour)).toContain('\n  "slug"');
  });
});
