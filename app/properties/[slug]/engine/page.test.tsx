// THE MOST IMPORTANT TEST IN THIS STORY (minecraft-test-suite.yaml) — the
// fallback-resolution regression guard for the exact gap design review
// caught during planning (design-discussion.md point 5): an earlier draft
// showed identical sample content on every property's /engine page forever,
// with no distinction between "no data yet" and "generic demo content."
// page.tsx's fix was extracted into lib/content-engine-resolution.ts's
// `resolveContentEngineData` (a pure refactor — see that module and
// page.tsx's header comments) specifically so it's testable here without
// rendering the Server Component.
//
// Two directions, both genuinely exercised against real fs behavior (not
// mocked out from under the function under test):
//
//  1. A slug with NO real content-engine data resolves to the sample-house
//     fallback and signals isFallback:true. Run against the REAL
//     public/content-engine/ directory (not a fixture) using "2806-prado" —
//     confirmed below to have no public/content-engine/2806-prado/ folder —
//     so this proves the actual production fallback path, not a simulated
//     one. If someone later added a real public/content-engine/2806-prado/
//     folder, the precondition assertion catches that and fails loudly
//     rather than the test silently testing nothing.
//
//  2. A slug WITH real content-engine data resolves to THAT data (not the
//     fallback) and signals isFallback:false. Constructed via the
//     injectable `baseDir` parameter pointed at a throwaway fixture
//     directory created with fs.mkdtempSync under the OS temp dir (cleaned
//     up in afterAll) — never touches the real public/ tree. The fixture's
//     engineering.md/flight-log.json content is deliberately DIFFERENT from
//     sample-house's real files, and the test asserts the resolved content
//     equals the fixture's content byte-for-byte and is NOT sample-house's
//     content. This is what makes the test real: if `resolveContentEngineData`
//     were hardcoded to always return the sample-house data regardless of
//     slug (the exact regression this guards against), this test would fail
//     — it isn't just checking isFallback is falsy, it's checking the
//     actual returned bytes came from the fixture.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  readContentEngineFiles,
  resolveContentEngineData,
  SAFE_SLUG_PATTERN,
  SAMPLE_SLUG,
} from "@/lib/content-engine-resolution";
import type { FlightLogEntry } from "@/lib/flight-log-types";

const REAL_CONTENT_ENGINE_DIR = path.join(process.cwd(), "public", "content-engine");

describe("resolveContentEngineData — fallback direction (no real data)", () => {
  const NO_DATA_SLUG = "2806-prado";

  it("precondition: public/content-engine/2806-prado/ genuinely does not exist", () => {
    // Guards the test itself against silently testing nothing if a future
    // story ever adds real content-engine data for this slug — if this
    // fires, pick a different slug that's still genuinely absent.
    expect(fs.existsSync(path.join(REAL_CONTENT_ENGINE_DIR, NO_DATA_SLUG))).toBe(false);
  });

  it("precondition: the sample-house fallback data genuinely exists on disk", () => {
    expect(
      fs.existsSync(path.join(REAL_CONTENT_ENGINE_DIR, SAMPLE_SLUG, "engineering.md")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(REAL_CONTENT_ENGINE_DIR, SAMPLE_SLUG, "flight-log.json")),
    ).toBe(true);
  });

  it("selects the sample-house fallback and signals isFallback:true, against the REAL public/content-engine/ directory", () => {
    const result = resolveContentEngineData(REAL_CONTENT_ENGINE_DIR, NO_DATA_SLUG);

    expect(result.isFallback).toBe(true);
    expect(result.content).not.toBeNull();

    // Not just "non-null" — assert the resolved bytes are LITERALLY the
    // real sample-house files read straight off disk, proving the fallback
    // path actually reads sample-house and isn't returning some other
    // hardcoded/synthetic stand-in.
    const expectedMarkdown = fs.readFileSync(
      path.join(REAL_CONTENT_ENGINE_DIR, SAMPLE_SLUG, "engineering.md"),
      "utf-8",
    );
    const expectedFlightLog = JSON.parse(
      fs.readFileSync(path.join(REAL_CONTENT_ENGINE_DIR, SAMPLE_SLUG, "flight-log.json"), "utf-8"),
    ) as FlightLogEntry[];

    expect(result.content?.engineeringMarkdown).toBe(expectedMarkdown);
    expect(result.content?.flightLog).toEqual(expectedFlightLog);
  });
});

describe("resolveContentEngineData — real-data direction (data present)", () => {
  // A throwaway fixture directory — NOT under public/, never committed —
  // built fresh per test run via mkdtemp and torn down in afterAll. This is
  // the "injectable base dir" approach the story explicitly allows as more
  // robust than a committed public/content-engine/<test-slug>/ fixture: it
  // can't drift from what the test expects, can't accidentally get treated
  // as real property data by anything else, and needs no cleanup step that
  // could be skipped.
  let fixtureBaseDir: string;
  const REAL_DATA_SLUG = "fixture-property";

  const FIXTURE_MARKDOWN =
    "# Engineering Notes — Fixture Property\n\nThis is deliberately NOT the sample-house content.\n";
  const FIXTURE_FLIGHT_LOG: FlightLogEntry[] = [
    { timestampMs: 0, lat: 12.3456, lon: -98.7654, altitudeMeters: 0 },
    { timestampMs: 400, lat: 12.346, lon: -98.7658, altitudeMeters: 9.1 },
  ];

  beforeAll(() => {
    fixtureBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), "content-engine-resolution-test-"));
    const propertyDir = path.join(fixtureBaseDir, REAL_DATA_SLUG);
    fs.mkdirSync(propertyDir, { recursive: true });
    fs.writeFileSync(path.join(propertyDir, "engineering.md"), FIXTURE_MARKDOWN, "utf-8");
    fs.writeFileSync(
      path.join(propertyDir, "flight-log.json"),
      JSON.stringify(FIXTURE_FLIGHT_LOG),
      "utf-8",
    );

    // resolveContentEngineData falls back to `<baseDir>/sample-house/` when
    // real data is absent — NOT exercised by this describe block, but the
    // fixture dir must still have it present so a bug that ignores the real
    // slug and always falls back doesn't accidentally read through to the
    // REAL repo's sample-house data (which would make the "not sample-house
    // content" assertions below meaningless — it'd just be comparing the
    // real sample-house file to itself). Giving the fixture its OWN
    // distinct sample-house stand-in closes that loophole.
    const sampleDir = path.join(fixtureBaseDir, SAMPLE_SLUG);
    fs.mkdirSync(sampleDir, { recursive: true });
    fs.writeFileSync(
      path.join(sampleDir, "engineering.md"),
      "# Fixture sample-house — should NOT be selected when real data is present\n",
      "utf-8",
    );
    fs.writeFileSync(path.join(sampleDir, "flight-log.json"), JSON.stringify([]), "utf-8");
  });

  afterAll(() => {
    fs.rmSync(fixtureBaseDir, { recursive: true, force: true });
  });

  it("selects the REAL per-slug data and signals isFallback:false", () => {
    const result = resolveContentEngineData(fixtureBaseDir, REAL_DATA_SLUG);

    expect(result.isFallback).toBe(false);
    expect(result.content).not.toBeNull();
    expect(result.content?.engineeringMarkdown).toBe(FIXTURE_MARKDOWN);
    expect(result.content?.flightLog).toEqual(FIXTURE_FLIGHT_LOG);

    // The regression this whole story exists to guard: a resolver that
    // ignored `slug` and always returned the fallback would still produce
    // non-null content, so the assertions above alone wouldn't catch it.
    // This explicitly proves the returned content is NOT the fixture's own
    // sample-house stand-in.
    const sampleMarkdown = fs.readFileSync(
      path.join(fixtureBaseDir, SAMPLE_SLUG, "engineering.md"),
      "utf-8",
    );
    expect(result.content?.engineeringMarkdown).not.toBe(sampleMarkdown);
  });

  it("still falls back correctly for a DIFFERENT, genuinely-absent slug against the same fixture dir", () => {
    // Same fixture directory, but a slug that has no folder in it at all —
    // proves the resolver isn't just "always real" once a baseDir happens
    // to contain some real-data folder; it's still per-slug.
    const result = resolveContentEngineData(fixtureBaseDir, "no-such-property");
    expect(result.isFallback).toBe(true);
    expect(result.content?.engineeringMarkdown).toBe(
      fs.readFileSync(path.join(fixtureBaseDir, SAMPLE_SLUG, "engineering.md"), "utf-8"),
    );
  });
});

describe("readContentEngineFiles — safety guard", () => {
  it("SAFE_SLUG_PATTERN rejects path-traversal-shaped slugs", () => {
    expect(SAFE_SLUG_PATTERN.test("../../etc")).toBe(false);
    expect(SAFE_SLUG_PATTERN.test("2806-prado")).toBe(true);
    expect(SAFE_SLUG_PATTERN.test("sample_house.2")).toBe(false);
  });

  it("returns null (never throws) for a path-traversal-shaped slug instead of escaping baseDir", () => {
    expect(readContentEngineFiles(REAL_CONTENT_ENGINE_DIR, "../../../../etc")).toBeNull();
  });

  it("returns null when only one of the two required files exists", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "content-engine-partial-test-"));
    try {
      const propertyDir = path.join(dir, "partial-property");
      fs.mkdirSync(propertyDir, { recursive: true });
      fs.writeFileSync(path.join(propertyDir, "engineering.md"), "only markdown, no flight log", "utf-8");
      expect(readContentEngineFiles(dir, "partial-property")).toBeNull();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
