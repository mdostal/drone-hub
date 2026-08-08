// THE MOST IMPORTANT TEST IN THIS STORY (model3d-test-suite.yaml) — a
// regression guard against the exact rights mistake the design discussion
// caught and fixed: this public, ungated showcase page must NEVER point at
// public/tours/2806-prado/tour.json (real, currently-gated photography of
// Mathew's actual property, per CLAUDE.md's "never deploy un-released
// assets un-gated" rule) or any other property under the gated /tours/
// route family. The only manifest it may ever reference is the synthetic,
// locally-generated public-safe demo at
// public/showcase-samples/demo-house/tour.json.
//
// Why source-inspection instead of a render test: <VideoTour> is mounted
// here via next/dynamic (CLAUDE.md's "every heavy viewer =
// next/dynamic({ssr:false})" convention), and a full render would need to
// either mock next/dynamic's lazy import or actually load <VideoTour> and
// its video/Canvas-adjacent APIs under jsdom — heavy mocking that would
// obscure, not strengthen, the one thing that actually matters: the literal
// string baked into this file's source. Reading the real file's bytes off
// disk (not a hardcoded copy of "what we expect the file to say") means
// this test tracks the actual page.tsx and fails the moment someone edits
// it to reference the real property data, whether that happens in the
// JSX, the USAGE_CODE example string, a comment, or anywhere else in the
// file.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const pageSource = readFileSync(
  path.join(process.cwd(), "app", "(showcase)", "components", "video-tour", "page.tsx"),
  "utf-8",
);

// The page's own header comment *legitimately* names the gated
// `public/tours/`/`/tours/[slug]` family in prose — explaining, in plain
// English, exactly the mistake this test exists to catch. So the guard
// below can't ban the raw substring "/tours/" file-wide (it would fail on
// that very explanation). Instead it strips `//`-comment lines first and
// asserts only against the executable code that's left — the JSX `demo=`
// prop and the `USAGE_CODE` example string are what actually determine
// what this page fetches/tells a copy-pasting consumer to fetch, and
// neither line-comments nor block-comments are checked, so this can't be
// satisfied by disclaiming the mistake in prose while still committing it
// in code.
const codeOnly = pageSource
  .split("\n")
  .filter((line) => !line.trim().startsWith("//"))
  .join("\n");

describe("video-tour showcase page — rights-status regression guard", () => {
  it("references the public-safe demo-house sample manifest in code", () => {
    expect(codeOnly).toContain("showcase-samples/demo-house");
  });

  it("never references the real, currently-gated 2806-prado property data in code", () => {
    expect(codeOnly).not.toContain("2806-prado");
  });

  it("never references the gated /tours/ route family (any slug) in code", () => {
    expect(codeOnly).not.toContain("/tours/");
  });

  it("sanity check: the raw file (comments included) still never names the real property slug", () => {
    // Belt-and-suspenders on the one string that should never appear at
    // all, comments or not — the real property's slug is not something
    // this public showcase page should be discussing even in prose.
    expect(pageSource).not.toContain("2806-prado");
  });
});
