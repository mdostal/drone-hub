// Rights-status regression guard for the public, ungated Gallery showcase
// page — same pattern as app/(showcase)/components/video-tour/page.test.tsx
// (see that file for the full incident history and why source-inspection
// rather than a render test). This page reuses the same already-authorized
// public/showcase-samples/2806-prado-tour/*.jpg stills <VideoTour>'s own
// showcase page uses — real 2806 Prado St interior photography, released
// for public use by the property's owner and privacy-checked before use
// (see CLAUDE.md's 2026-08-09 "real, rights-cleared 2806 Prado data IS now
// in drone-hub's public samples" correction). No new asset here, so this
// guard just confirms the page keeps pointing at that already-cleared
// sample directory and never references the gated /tours/ route family
// (the original incident's specific content path, still permanently banned).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const pageSource = readFileSync(
  path.join(process.cwd(), "app", "(showcase)", "components", "gallery", "page.tsx"),
  "utf-8",
);

const codeOnly = pageSource
  .split("\n")
  .filter((line) => !line.trim().startsWith("//"))
  .join("\n");

describe("gallery showcase page — rights-status regression guard", () => {
  it("references the real, rights-cleared 2806-prado-tour sample stills in code", () => {
    expect(codeOnly).toContain("showcase-samples/2806-prado-tour");
  });

  it("never references the gated /tours/ route family (any slug) in code", () => {
    expect(codeOnly).not.toContain("/tours/");
  });

  it("never references public/tours/ directly in code", () => {
    expect(codeOnly).not.toContain("public/tours");
  });
});
