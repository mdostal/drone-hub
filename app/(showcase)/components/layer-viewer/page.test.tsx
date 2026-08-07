// Lighter companion to the video-tour showcase page's rights-status
// regression guard (app/(showcase)/components/video-tour/page.test.tsx —
// see that file for why source-inspection rather than a render test).
// public/layer-viewer-samples/2806-prado/layers.json is already confirmed
// public-safe/synthetic sample data (per this page's own header comment
// and public/layer-viewer-samples/2806-prado/manifest.test.ts), so this is
// a smoke check that the page still points at the expected sample manifest
// — not a rights guard like video-tour's.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const pageSource = readFileSync(
  path.join(process.cwd(), "app", "(showcase)", "components", "layer-viewer", "page.tsx"),
  "utf-8",
);

describe("layer-viewer showcase page — sample-data source", () => {
  it("references the public-safe layer-viewer-samples manifest", () => {
    expect(pageSource).toContain("layer-viewer-samples/2806-prado/layers.json");
  });

  it("never references the gated /tours/ route family", () => {
    expect(pageSource).not.toContain("/tours/");
  });
});
