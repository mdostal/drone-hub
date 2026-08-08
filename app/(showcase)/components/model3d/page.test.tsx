// Lighter companion to the video-tour showcase page's rights-status
// regression guard (app/(showcase)/components/video-tour/page.test.tsx —
// see that file for why source-inspection rather than a render test).
// public/model3d-samples/duck/model.glb is a generic, public-safe
// placeholder glTF (per this page's own header comment), not property
// photogrammetry output, so this is a smoke check that the page still
// points at the expected sample asset — not a rights guard like
// video-tour's.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const pageSource = readFileSync(
  path.join(process.cwd(), "app", "(showcase)", "components", "model3d", "page.tsx"),
  "utf-8",
);

describe("model3d showcase page — sample-data source", () => {
  it("references the public-safe model3d-samples sample glTF", () => {
    expect(pageSource).toContain("model3d-samples/duck/model.glb");
  });

  it("never references the gated /tours/ or /properties/ route families", () => {
    expect(pageSource).not.toContain("/tours/");
    expect(pageSource).not.toContain("/properties/");
  });
});
