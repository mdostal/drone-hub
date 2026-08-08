// Unit specs for the pure band/part -> Minecraft block-state string mapping
// table. No NBT/gzip involved — see minecraft-schematic.test.ts for the
// schematic writer itself.
import { describe, expect, it } from "vitest";
import type { StructurePart, TerrainBand } from "@/components/VoxelTerrain/voxel-geometry";
import { AIR_BLOCK, blockForStructurePart, blockForTerrainBand } from "./minecraft-block-palette";

describe("blockForTerrainBand", () => {
  it("maps each band to a real, core, version-stable block-state string", () => {
    expect(blockForTerrainBand("low")).toBe("minecraft:grass_block");
    expect(blockForTerrainBand("mid")).toBe("minecraft:dirt");
    expect(blockForTerrainBand("high")).toBe("minecraft:stone");
  });

  it("returns a distinct block for every band", () => {
    const bands: TerrainBand[] = ["low", "mid", "high"];
    const blocks = new Set(bands.map(blockForTerrainBand));
    expect(blocks.size).toBe(bands.length);
  });

  it("every mapped block is a well-formed minecraft: namespaced ID", () => {
    for (const band of ["low", "mid", "high"] as TerrainBand[]) {
      expect(blockForTerrainBand(band)).toMatch(/^minecraft:[a-z_]+$/);
    }
  });
});

describe("blockForStructurePart", () => {
  it("maps wall -> oak_planks and roof -> red_wool", () => {
    expect(blockForStructurePart("wall")).toBe("minecraft:oak_planks");
    expect(blockForStructurePart("roof")).toBe("minecraft:red_wool");
  });

  it("returns a distinct block for wall vs roof", () => {
    const parts: StructurePart[] = ["wall", "roof"];
    const blocks = new Set(parts.map(blockForStructurePart));
    expect(blocks.size).toBe(parts.length);
  });
});

describe("AIR_BLOCK", () => {
  it("is the real minecraft:air block-state string", () => {
    expect(AIR_BLOCK).toBe("minecraft:air");
  });

  it("is never returned by the terrain or structure mappers (dense-grid air is a distinct concept)", () => {
    const terrainBlocks: TerrainBand[] = ["low", "mid", "high"];
    const structureBlocks: StructurePart[] = ["wall", "roof"];
    expect(terrainBlocks.map(blockForTerrainBand)).not.toContain(AIR_BLOCK);
    expect(structureBlocks.map(blockForStructurePart)).not.toContain(AIR_BLOCK);
  });
});
