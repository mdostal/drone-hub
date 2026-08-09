// Lighter companion to the video-tour showcase page's rights-status
// regression guard (app/(showcase)/components/video-tour/page.test.tsx —
// see that file for why source-inspection rather than a render test).
// public/model3d-samples/prado/model.glb is REAL property photogrammetry
// (the operator's own 2806 Prado St reconstruction, released for public
// use with the owner's explicit permission — see this page's own header
// comment and docs/components/model3d.md's provenance section), so this
// guard checks the page still points at the expected, rights-cleared
// sample asset — not a generic-placeholder smoke check anymore.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const pageSource = readFileSync(
  path.join(process.cwd(), "app", "(showcase)", "components", "model3d", "page.tsx"),
  "utf-8",
);

describe("model3d showcase page — sample-data source", () => {
  it("references the real, rights-cleared model3d-samples/prado sample glTF", () => {
    expect(pageSource).toContain("model3d-samples/prado/model.glb");
  });

  it("never references the gated /tours/ or /properties/ route families", () => {
    expect(pageSource).not.toContain("/tours/");
    expect(pageSource).not.toContain("/properties/");
  });
});
