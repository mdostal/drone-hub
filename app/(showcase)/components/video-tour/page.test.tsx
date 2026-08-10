// Rights-status regression guard for the public, ungated VideoTour showcase
// page — UPDATED 2026-08-09 (real-tour story). Do not revert this file to
// its pre-2026-08-09 form without reading CLAUDE.md's "real, rights-cleared
// 2806 Prado data IS now in drone-hub's public samples" correction first.
//
// This test's ORIGINAL purpose (model3d-test-suite.yaml, 2026-08-08) was a
// hard ban on the literal string "2806-prado" appearing anywhere in this
// page's code — a direct response to a real incident where real, currently-
// gated PROFESSIONAL real-estate-shoot photography
// (`public/tours/2806-prado/*.jpg`) was briefly exposed on a public GitHub
// repo before shoot-permission/release-forms were finalized.
//
// That incident's content is NOT what this page references now. As of
// 2026-08-09 the demo is a DIFFERENT, deliberately-authorized real asset:
// the operator's own casual/practice interior walkthrough of the same
// house (2806 Prado St, being sold) — explicitly, repeatedly cleared for
// public use by the property's owner (full release rights, given directly
// in-session, including choosing "public drone-hub" over private-only when
// asked), and verified privacy-flag-clean (no people/children in any of the
// 38 candidate clips) before use. The two are different content under
// different authorization — see CLAUDE.md for the full distinction before
// assuming either "anything 2806-prado is fine now" or "the old ban still
// fully applies." Neither is right; this file encodes the real boundary:
// it still guards against the OLD incident's specific gated content path,
// it just no longer bans the new, authorized sample it exists to showcase.
//
// Why source-inspection instead of a render test: unchanged from the
// original — see the string-in-source rationale this file has always used.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const pageSource = readFileSync(
  path.join(process.cwd(), "app", "(showcase)", "components", "video-tour", "page.tsx"),
  "utf-8",
);

const codeOnly = pageSource
  .split("\n")
  .filter((line) => !line.trim().startsWith("//"))
  .join("\n");

describe("video-tour showcase page — rights-status regression guard", () => {
  it("references the real, rights-cleared 2806-prado-tour sample manifest in code", () => {
    expect(codeOnly).toContain("showcase-samples/2806-prado-tour");
  });

  it("never references the gated /tours/ route family (any slug) in code — the original incident's specific content path", () => {
    expect(codeOnly).not.toContain("/tours/");
  });

  it("never references public/tours/ directly (the original incident's exact file path) in code", () => {
    expect(codeOnly).not.toContain("public/tours");
  });
});
