// Lighter companion to the model3d showcase page's sample-data smoke check
// (app/(showcase)/components/model3d/page.test.tsx — see that file for why
// source-inspection rather than a render test: the page's real content is a
// next/dynamic({ssr:false}) WebGL viewer, not something jsdom renders
// meaningfully). public/minecraft-samples/2806-prado/heightmap.json is
// already-confirmed public-safe derived terrain (this story's yaml), not
// gated property photogrammetry, so this just guards the page keeps
// pointing at that sample and never references a gated route family.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const pageSource = readFileSync(
  path.join(process.cwd(), "app", "(showcase)", "components", "voxel-terrain", "page.tsx"),
  "utf-8",
);
const demoSource = readFileSync(
  path.join(process.cwd(), "app", "(showcase)", "components", "voxel-terrain", "VoxelTerrainDemo.tsx"),
  "utf-8",
);

describe("voxel-terrain showcase page — sample-data source", () => {
  it("references the public-safe minecraft-samples sample heightmap", () => {
    expect(demoSource).toContain("minecraft-samples/2806-prado/heightmap.json");
  });

  it("never references the gated /tours/ or /properties/ route families", () => {
    expect(pageSource).not.toContain("/tours/");
    expect(pageSource).not.toContain("/properties/");
    expect(demoSource).not.toContain("/tours/");
    expect(demoSource).not.toContain("/properties/");
  });
});
