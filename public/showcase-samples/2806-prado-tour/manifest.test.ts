import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Tour, TourEdge, TourRoom } from "@/lib/tour-types";
import tourJson from "./tour.json";

// Verification for the real 2806 Prado St interior-walkthrough sample —
// see CLAUDE.md's 2026-08-09 "real, rights-cleared 2806 Prado data IS now
// in drone-hub's public samples" correction for the full authorization
// history before assuming real property content shouldn't be here. This IS
// real property photography/video, unlike demo-house's synthetic SVG
// placeholders — released for public use by the property's owner with
// full rights, verified privacy-flag-clean before use (no people/children
// in any of the 38 candidate interior clips this sample was picked from).
//
// Same runtime-type-guard pattern as
// public/showcase-samples/demo-house/manifest.test.ts and
// public/layer-viewer-samples/2806-prado/manifest.test.ts.

function assertTourEdge(x: unknown, where: string): asserts x is TourEdge {
  expect(x, where).toBeTypeOf("object");
  const e = x as Record<string, unknown>;
  expect(typeof e.to, `${where}.to`).toBe("string");
  expect(e.clip === null || typeof e.clip === "string", `${where}.clip should be string | null`).toBe(true);
  if ("label" in e) expect(typeof e.label, `${where}.label`).toBe("string");
}

function assertTourRoom(x: unknown, index: number): asserts x is TourRoom {
  expect(x, `rooms[${index}]`).toBeTypeOf("object");
  const r = x as Record<string, unknown>;
  expect(typeof r.id, `rooms[${index}].id`).toBe("string");
  expect(typeof r.label, `rooms[${index}].label`).toBe("string");
  expect(r.spin === null || typeof r.spin === "string", `rooms[${index}].spin should be string | null`).toBe(true);
  expect(typeof r.still, `rooms[${index}].still`).toBe("string");
  expect(Array.isArray(r.pos), `rooms[${index}].pos should be an array`).toBe(true);
  expect((r.pos as unknown[]).length, `rooms[${index}].pos should be [x,y]`).toBe(2);
  (r.pos as unknown[]).forEach((n, i) => expect(typeof n, `rooms[${index}].pos[${i}]`).toBe("number"));
  expect(Array.isArray(r.neighbors), `rooms[${index}].neighbors should be an array`).toBe(true);
  (r.neighbors as unknown[]).forEach((e, i) => assertTourEdge(e, `rooms[${index}].neighbors[${i}]`));
}

function assertTour(x: unknown): asserts x is Tour {
  expect(x).toBeTypeOf("object");
  const t = x as Record<string, unknown>;
  expect(typeof t.slug).toBe("string");
  expect(typeof t.title).toBe("string");
  expect(typeof t.startRoom).toBe("string");
  expect(Array.isArray(t.rooms)).toBe(true);
  (t.rooms as unknown[]).forEach((r, i) => assertTourRoom(r, i));
}

const sampleDir = path.dirname(new URL(import.meta.url).pathname);
const ROOM_IDS = ["entry", "living", "kitchen", "hallway", "bedroom", "bathroom", "closet", "garage", "patio"];

describe("2806-prado-tour showcase manifest (real property, rights-cleared)", () => {
  it("runtime-validates and type-checks as a valid Tour", () => {
    const raw: unknown = tourJson;
    assertTour(raw);
    const tour: Tour = raw;
    expect(tour.slug).toBe("2806-prado-tour");
    expect(tour.title).toContain("real interior walkthrough");
  });

  it("has all 9 real rooms with a fully valid doorway graph", () => {
    expect(tourJson.rooms.map((r) => r.id).sort()).toEqual([...ROOM_IDS].sort());
    const ids = new Set(tourJson.rooms.map((r) => r.id));
    expect(ids.has(tourJson.startRoom)).toBe(true);
    for (const room of tourJson.rooms) {
      for (const edge of room.neighbors) {
        expect(ids.has(edge.to), `${room.id} -> ${edge.to} should target a real room`).toBe(true);
      }
    }
  });

  it("every edge has clip:null — no transition-flight footage was captured between specific rooms, only per-room clips", () => {
    for (const room of tourJson.rooms) {
      for (const edge of room.neighbors) {
        expect(edge.clip, `${room.id} -> ${edge.to}.clip`).toBeNull();
      }
    }
  });

  it("every room has a real spin clip (unlike demo-house, every room here has real footage)", () => {
    for (const room of tourJson.rooms) {
      expect(room.spin, `${room.id}.spin`).not.toBeNull();
      expect(room.spin).toBe(`${room.id}.mp4`);
    }
  });

  it("every room's spin.mp4 exists as a real, small, well-formed MP4 (magic bytes, size budget)", () => {
    for (const room of tourJson.rooms) {
      const filePath = path.join(sampleDir, room.spin as string);
      expect(existsSync(filePath), `${filePath} should exist`).toBe(true);
      const buf = readFileSync(filePath);
      expect(buf.subarray(4, 8).toString("ascii"), `${room.id}.mp4 should be a well-formed MP4 (ftyp box)`).toBe(
        "ftyp",
      );
      // Compressed from real 4K source (8s, 960px, muted) -- budget generously.
      expect(buf.byteLength, `${room.id}.mp4 should be small`).toBeLessThan(2 * 1024 * 1024);
    }
  });

  it("every room's still resolves to a real JPEG frame extracted from that room's own clip", () => {
    for (const room of tourJson.rooms) {
      expect(room.still.startsWith("/"), `${room.id}: still should be a relative filename, not root-absolute`).toBe(
        false,
      );
      const filePath = path.join(sampleDir, room.still);
      expect(existsSync(filePath), `${room.id}: ${filePath} should exist`).toBe(true);
      const buf = readFileSync(filePath);
      // JPEG magic bytes: FF D8 FF.
      expect(buf.subarray(0, 3).toString("hex"), `${room.id} still should be a real JPEG`).toBe("ffd8ff");
      expect(buf.byteLength, `${room.id}.jpg should be small`).toBeLessThan(500 * 1024);
    }
  });
});
