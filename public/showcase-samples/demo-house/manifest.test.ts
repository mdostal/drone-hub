import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Tour, TourEdge, TourRoom } from "@/lib/tour-types";
import { GATED_PATH_PREFIXES } from "@/lib/gate";
import tourJson from "./tour.json";

// Verification for the model3d-videotour-demo-data story: a genuinely
// public-safe demo tour for the public, ungated component-showcase site.
// This must NEVER be the real public/tours/2806-prado/tour.json (real
// photography of Mathew's actual, currently-listed property, gated for
// exactly that reason — see CLAUDE.md's "never deploy un-released assets
// un-gated" rule). Kept as a real test (not throwaway) so it re-runs under
// `npm run test` and catches drift.
//
// Same runtime-type-guard pattern as
// public/layer-viewer-samples/2806-prado/manifest.test.ts: a plain JSON
// import widens string-literal/union fields to `string`, so a bare
// `const x: Tour = tourJson` doesn't actually exercise `lib/tour-types.ts`'s
// shape. `assertTour` below both type-checks at compile time (its `asserts`
// signature is checked by `tsc`/`npm run build`) and proves the *actual*
// JSON content is valid at runtime.

function assertTourEdge(x: unknown, where: string): asserts x is TourEdge {
  expect(x, where).toBeTypeOf("object");
  const e = x as Record<string, unknown>;
  expect(typeof e.to, `${where}.to`).toBe("string");
  expect(e.clip === null || typeof e.clip === "string", `${where}.clip should be string | null`).toBe(
    true,
  );
  if ("label" in e) expect(typeof e.label, `${where}.label`).toBe("string");
}

function assertTourRoom(x: unknown, index: number): asserts x is TourRoom {
  expect(x, `rooms[${index}]`).toBeTypeOf("object");
  const r = x as Record<string, unknown>;
  expect(typeof r.id, `rooms[${index}].id`).toBe("string");
  expect(typeof r.label, `rooms[${index}].label`).toBe("string");
  expect(r.spin === null || typeof r.spin === "string", `rooms[${index}].spin should be string | null`).toBe(
    true,
  );
  expect(typeof r.still, `rooms[${index}].still`).toBe("string");
  expect(Array.isArray(r.pos), `rooms[${index}].pos should be an array`).toBe(true);
  expect((r.pos as unknown[]).length, `rooms[${index}].pos should be [x,y]`).toBe(2);
  (r.pos as unknown[]).forEach((n, i) =>
    expect(typeof n, `rooms[${index}].pos[${i}]`).toBe("number"),
  );
  expect(Array.isArray(r.neighbors), `rooms[${index}].neighbors should be an array`).toBe(true);
  (r.neighbors as unknown[]).forEach((e, i) =>
    assertTourEdge(e, `rooms[${index}].neighbors[${i}]`),
  );
}

function assertTour(x: unknown): asserts x is Tour {
  expect(x).toBeTypeOf("object");
  const t = x as Record<string, unknown>;
  expect(typeof t.slug).toBe("string");
  expect(typeof t.title).toBe("string");
  expect(typeof t.startRoom).toBe("string");
  expect(Array.isArray(t.rooms)).toBe(true);
  (t.rooms as unknown[]).forEach((r, i) => assertTourRoom(r, i));
  if ("gated" in t) expect(typeof t.gated).toBe("boolean");
  if ("audio" in t) expect(t.audio === null || typeof t.audio === "string").toBe(true);
}

const sampleDir = path.dirname(new URL(import.meta.url).pathname);

describe("demo-house showcase manifest", () => {
  it("runtime-validates and type-checks as a valid Tour", () => {
    const raw: unknown = tourJson;
    assertTour(raw);
    const tour: Tour = raw; // narrowed by the assertion above, no cast needed
    expect(tour.slug).toBe("demo-house");
    expect(tour.title).toBe("Demo House (showcase sample — not a real property)");
  });

  it("slug/title clearly signal 'demo/sample', not a real address", () => {
    expect(tourJson.slug).toMatch(/demo/i);
    expect(tourJson.title.toLowerCase()).toContain("showcase sample");
    expect(tourJson.title.toLowerCase()).toContain("not a real property");
    // Not the real property's slug/title/path, and not stored under the
    // real gated tours directory.
    expect(tourJson.slug).not.toBe("2806-prado");
    expect(sampleDir).toContain(`${path.sep}showcase-samples${path.sep}`);
    expect(sampleDir).not.toContain(`${path.sep}tours${path.sep}`);
  });

  it("has 4-6 rooms with a valid doorway graph (every neighbor id exists)", () => {
    expect(tourJson.rooms.length).toBeGreaterThanOrEqual(4);
    expect(tourJson.rooms.length).toBeLessThanOrEqual(6);
    const ids = new Set(tourJson.rooms.map((r) => r.id));
    expect(ids.has(tourJson.startRoom)).toBe(true);
    for (const room of tourJson.rooms) {
      for (const edge of room.neighbors) {
        expect(ids.has(edge.to), `${room.id} -> ${edge.to} should target a real room`).toBe(true);
      }
    }
  });

  it("every room has spin:null and every edge has clip:null (P1 stills + wipes only)", () => {
    for (const room of tourJson.rooms) {
      expect(room.spin, `${room.id}.spin`).toBeNull();
      for (const edge of room.neighbors) {
        expect(edge.clip, `${room.id} -> ${edge.to}.clip`).toBeNull();
      }
    }
  });

  it("every room's still resolves to a real, locally-generated placeholder file under public/showcase-samples/demo-house/", () => {
    for (const room of tourJson.rooms) {
      // still is a bare filename, relative to this manifest's own directory
      // — see components/VideoTour/VideoTour.tsx's resolveTourAssetUrls()
      // for why (root-absolute paths break under any basePath/mount prefix).
      expect(room.still.startsWith("/"), `${room.id}: still should be a relative filename, not root-absolute`).toBe(
        false,
      );
      const filePath = path.join(sampleDir, room.still);
      expect(existsSync(filePath), `${room.id}: ${filePath} should exist`).toBe(true);
      const contents = readFileSync(filePath, "utf-8");
      // Generated SVG placeholders (see the story's generator script), not
      // photographs: must be well-formed SVG text carrying the baked-in
      // "DEMO" disclaimer, never a binary photo format (jpg/png/heic/...).
      expect(contents.startsWith("<svg"), `${room.id} still should be a generated SVG`).toBe(true);
      expect(contents).toContain("DEMO — fictional room, not a real property");
    }
  });

  it("public/showcase-samples/ is NOT covered by middleware.ts's GATED_PATH_PREFIXES", () => {
    // GATED_PATH_PREFIXES is the single source of truth middleware.ts derives
    // its matcher from (see lib/gate.ts / middleware.ts). Assert directly
    // against it rather than duplicating the list, so this test can't drift.
    expect(GATED_PATH_PREFIXES).toEqual(["/tours", "/properties"]);
    for (const prefix of GATED_PATH_PREFIXES) {
      expect(`/showcase-samples/demo-house/tour.json`.startsWith(prefix)).toBe(false);
    }
  });
});
