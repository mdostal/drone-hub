// Unit specs for voxel-geometry.ts's pure grid-to-world/coloring/block-list
// logic — the WebGL-independent half of the VoxelTerrain/VoxelStructure
// family (see this file's header comment for why it's split out). The
// actual <Canvas>/<Instances> rendering stays live/Playwright-only, same
// precedent as components/Model3D/Model3D.test.tsx.
import { describe, expect, it } from "vitest";
import type { VoxelGrid } from "@/lib/voxel-types";
import {
  BLOCK_SIZE,
  buildHouseBlocks,
  buildTerrainBlocks,
  CELL_SIZE,
  classifyHeightBand,
  gridToWorldX,
  gridToWorldZ,
  heightAt,
  heightBandColor,
  houseCells,
  terrainCells,
} from "./voxel-geometry";

function flatGrid(size: number, heights: number[]): VoxelGrid {
  return { slug: "test", title: "test grid", size, heights };
}

describe("gridToWorldX / gridToWorldZ", () => {
  it("centers a grid on the origin (size 4: cols 0..3 -> -1.5..1.5)", () => {
    expect(gridToWorldX(0, 4)).toBeCloseTo(-1.5);
    expect(gridToWorldX(3, 4)).toBeCloseTo(1.5);
    expect(gridToWorldZ(0, 4)).toBeCloseTo(-1.5);
    expect(gridToWorldZ(3, 4)).toBeCloseTo(1.5);
  });

  it("centers an odd-sized grid exactly on its middle column/row", () => {
    expect(gridToWorldX(1, 3)).toBe(0);
    expect(gridToWorldZ(1, 3)).toBe(0);
  });

  it("scales by CELL_SIZE", () => {
    expect(gridToWorldX(1, 4) - gridToWorldX(0, 4)).toBe(CELL_SIZE);
  });
});

describe("heightAt", () => {
  const grid = flatGrid(2, [1, 2, 3, 4]); // row-major: (0,0)=1 (1,0)=2 (0,1)=3 (1,1)=4

  it("resolves (gridX, gridZ) through the row-major heights index", () => {
    expect(heightAt(grid, 0, 0)).toBe(1);
    expect(heightAt(grid, 1, 0)).toBe(2);
    expect(heightAt(grid, 0, 1)).toBe(3);
    expect(heightAt(grid, 1, 1)).toBe(4);
  });

  it("throws on an out-of-bounds cell instead of returning undefined", () => {
    expect(() => heightAt(grid, 2, 0)).toThrow(RangeError);
    expect(() => heightAt(grid, 0, -1)).toThrow(RangeError);
    expect(() => heightAt(grid, 1.5, 0)).toThrow(RangeError);
  });
});

describe("heightBandColor", () => {
  it("bands low levels green, mid brown, high grey", () => {
    expect(heightBandColor(1)).toBe(heightBandColor(3));
    expect(heightBandColor(3)).not.toBe(heightBandColor(4));
    expect(heightBandColor(4)).toBe(heightBandColor(5));
    expect(heightBandColor(5)).not.toBe(heightBandColor(6));
    expect(heightBandColor(6)).toBe(heightBandColor(8));
  });
});

describe("classifyHeightBand", () => {
  it("is the same band boundary heightBandColor keys off of", () => {
    expect(classifyHeightBand(1)).toBe("low");
    expect(classifyHeightBand(3)).toBe("low");
    expect(classifyHeightBand(4)).toBe("mid");
    expect(classifyHeightBand(5)).toBe("mid");
    expect(classifyHeightBand(6)).toBe("high");
    expect(classifyHeightBand(8)).toBe("high");
  });

  it("heightBandColor is derived from classifyHeightBand, not a parallel threshold check", () => {
    for (let level = 1; level <= 10; level++) {
      const band = classifyHeightBand(level);
      const expectedColor = band === "low" ? "#4a8f3c" : band === "mid" ? "#8b5e3c" : "#8f9296";
      expect(heightBandColor(level)).toBe(expectedColor);
    }
  });
});

// minecraft-export epic (design-discussion.md correction 3b): these raw
// integer coordinate exports are what lib/minecraft-schematic.ts consumes
// directly — the whole point is that they are NEVER fractional/centered,
// unlike gridToWorldX/Z. These specs are this story's acceptance criterion
// "exposes raw integer (col, stackLevel, row) grid coordinates with no
// fractional/centered offset."
describe("terrainCells", () => {
  it("emits exactly sum(heights) cells, same count as buildTerrainBlocks", () => {
    const grid = flatGrid(2, [1, 2, 3, 4]);
    expect(terrainCells(grid)).toHaveLength(1 + 2 + 3 + 4);
  });

  it("uses the grid's OWN raw col/row indices — never gridToWorldX/Z's centered values", () => {
    const grid = flatGrid(4, [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const [cell] = terrainCells(grid);
    // col 0, row 0 for a size-4 grid would be -1.5 under gridToWorldX/Z —
    // assert the raw cell is the untransformed integer instead.
    expect(cell.col).toBe(0);
    expect(cell.row).toBe(0);
    expect(Number.isInteger(cell.col)).toBe(true);
    expect(Number.isInteger(cell.row)).toBe(true);
  });

  it("every emitted cell has non-negative integer col/row/stackLevel", () => {
    const grid = flatGrid(5, [1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 2, 3, 4, 5]);
    for (const cell of terrainCells(grid)) {
      expect(Number.isInteger(cell.col)).toBe(true);
      expect(Number.isInteger(cell.row)).toBe(true);
      expect(Number.isInteger(cell.stackLevel)).toBe(true);
      expect(cell.col).toBeGreaterThanOrEqual(0);
      expect(cell.row).toBeGreaterThanOrEqual(0);
      expect(cell.stackLevel).toBeGreaterThanOrEqual(1);
    }
  });

  it("stackLevel 1 is always the ground layer, matching the classifyHeightBand numbering", () => {
    const grid = flatGrid(1, [3]);
    const cells = terrainCells(grid);
    expect(cells.map((c) => c.stackLevel)).toEqual([1, 2, 3]);
    expect(cells.map((c) => c.band)).toEqual(["low", "low", "low"]);
  });

  it("band matches classifyHeightBand(stackLevel) — the shared classification, not a duplicate", () => {
    const grid = flatGrid(1, [8]);
    for (const cell of terrainCells(grid)) {
      expect(cell.band).toBe(classifyHeightBand(cell.stackLevel));
    }
  });

  it("buildTerrainBlocks' world positions are terrainCells' raw cells run through gridToWorldX/Z", () => {
    const grid = flatGrid(4, [1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const cells = terrainCells(grid);
    const blocks = buildTerrainBlocks(grid);
    expect(blocks).toHaveLength(cells.length);
    cells.forEach((cell, i) => {
      expect(blocks[i].position[0]).toBeCloseTo(gridToWorldX(cell.col, grid.size));
      expect(blocks[i].position[2]).toBeCloseTo(gridToWorldZ(cell.row, grid.size));
    });
  });
});

describe("houseCells", () => {
  const grid = flatGrid(9, new Array(81).fill(2));

  it("every emitted cell has integer col/row/stackLevel (raw, not fractional)", () => {
    const cells = houseCells(grid, 4, 4, 5, 5, 3);
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      expect(Number.isInteger(cell.col)).toBe(true);
      expect(Number.isInteger(cell.row)).toBe(true);
      expect(Number.isInteger(cell.stackLevel)).toBe(true);
    }
  });

  it("stacks walls starting exactly one level above the terrain's own height", () => {
    const cells = houseCells(grid, 4, 4, 3, 3, 2);
    const baseHeight = heightAt(grid, 4, 4);
    const wallLevels = cells.filter((c) => c.part === "wall").map((c) => c.stackLevel);
    expect(Math.min(...wallLevels)).toBe(baseHeight + 1);
    expect(Math.max(...wallLevels)).toBe(baseHeight + 2);
  });

  it("centers the footprint on (gridX, gridZ) using absolute (not centered-on-origin) coordinates", () => {
    const cells = houseCells(grid, 4, 4, 3, 3, 1);
    const cols = cells.map((c) => c.col);
    const rows = cells.map((c) => c.row);
    // width/depth 3 centered on 4 -> footprint spans cols/rows 3..5.
    expect(Math.min(...cols)).toBe(3);
    expect(Math.max(...cols)).toBe(5);
    expect(Math.min(...rows)).toBe(3);
    expect(Math.max(...rows)).toBe(5);
  });

  it("rejects an even width/depth — no single integer center column/row exists", () => {
    expect(() => houseCells(grid, 4, 4, 4, 4, 2)).toThrow(RangeError);
  });

  it("throws when centered outside the grid, same as heightAt", () => {
    expect(() => houseCells(grid, 99, 0)).toThrow(RangeError);
  });

  it("buildHouseBlocks' world positions match houseCells' raw cells run through the centering transform", () => {
    const cells = houseCells(grid, 4, 4, 3, 3, 2);
    const blocks = buildHouseBlocks(grid, 4, 4, 3, 3, 2);
    expect(blocks).toHaveLength(cells.length);
    const baseHeight = heightAt(grid, 4, 4);
    cells.forEach((cell, i) => {
      expect(blocks[i].position[0]).toBeCloseTo(gridToWorldX(cell.col, grid.size));
      expect(blocks[i].position[2]).toBeCloseTo(gridToWorldZ(cell.row, grid.size));
      expect(blocks[i].position[1]).toBeCloseTo((cell.stackLevel - 0.5) * BLOCK_SIZE);
      expect(baseHeight).toBeGreaterThan(0);
    });
  });
});

describe("buildTerrainBlocks", () => {
  it("emits exactly sum(heights) blocks (one per stacked level per cell)", () => {
    const grid = flatGrid(2, [1, 2, 3, 4]);
    expect(buildTerrainBlocks(grid)).toHaveLength(1 + 2 + 3 + 4);
  });

  it("stacks a column's blocks from the ground up with no gaps/overlaps", () => {
    const grid = flatGrid(1, [3]);
    const blocks = buildTerrainBlocks(grid);
    const ys = blocks.map((b) => b.position[1]).sort((a, b) => a - b);
    expect(ys).toEqual([0.5, 1.5, 2.5].map((y) => y * BLOCK_SIZE));
  });

  it("returns no blocks for an all-zero-height grid", () => {
    const grid = flatGrid(2, [0, 0, 0, 0]);
    expect(buildTerrainBlocks(grid)).toHaveLength(0);
  });

  it("places each cell's column at that cell's own world X/Z", () => {
    const grid = flatGrid(2, [1, 0, 0, 0]);
    const [block] = buildTerrainBlocks(grid);
    expect(block.position[0]).toBeCloseTo(gridToWorldX(0, 2));
    expect(block.position[2]).toBeCloseTo(gridToWorldZ(0, 2));
  });
});

describe("buildHouseBlocks", () => {
  const grid = flatGrid(4, [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2]);

  it("starts the walls' bottom level exactly at the terrain's own height (sits on top, no gap/sink)", () => {
    const blocks = buildHouseBlocks(grid, 1, 1, 3, 3, 2);
    const baseHeight = heightAt(grid, 1, 1);
    const minY = Math.min(...blocks.map((b) => b.position[1]));
    // first wall block's center should be at (baseHeight + 1 - 0.5) * BLOCK_SIZE
    expect(minY).toBeCloseTo((baseHeight + 0.5) * BLOCK_SIZE);
  });

  it("walls are hollow — no block at the footprint's interior cells", () => {
    const width = 5;
    const depth = 5;
    const wallHeight = 2;
    const blocks = buildHouseBlocks(grid, 2, 2, width, depth, wallHeight);
    const originX = gridToWorldX(2, grid.size);
    const originZ = gridToWorldZ(2, grid.size);
    const baseHeight = heightAt(grid, 2, 2);
    // the exact center cell at the lowest wall level would be an interior
    // wall block if walls were solid — assert it's absent.
    const interiorWallY = (baseHeight + 1 - 0.5) * BLOCK_SIZE;
    const hasInteriorWallBlock = blocks.some(
      (b) =>
        Math.abs(b.position[0] - originX) < 1e-6 &&
        Math.abs(b.position[2] - originZ) < 1e-6 &&
        Math.abs(b.position[1] - interiorWallY) < 1e-6,
    );
    expect(hasInteriorWallBlock).toBe(false);
  });

  it("roof sits above the walls and narrows toward an apex", () => {
    const width = 5;
    const depth = 5;
    const wallHeight = 3;
    const blocks = buildHouseBlocks(grid, 2, 2, width, depth, wallHeight);
    const baseHeight = heightAt(grid, 2, 2);
    const roofStartY = (baseHeight + wallHeight + 0.5) * BLOCK_SIZE;
    const roofBlocks = blocks.filter((b) => b.position[1] >= roofStartY - 1e-6);
    expect(roofBlocks.length).toBeGreaterThan(0);
    // topmost roof level should have fewer blocks than the bottom roof
    // level (the "narrows toward an apex" shape).
    const levels = new Map<number, number>();
    for (const b of roofBlocks) {
      levels.set(b.position[1], (levels.get(b.position[1]) ?? 0) + 1);
    }
    const sortedYs = [...levels.keys()].sort((a, b) => a - b);
    const bottomCount = levels.get(sortedYs[0])!;
    const topCount = levels.get(sortedYs[sortedYs.length - 1])!;
    expect(topCount).toBeLessThanOrEqual(bottomCount);
  });

  it("throws when placed outside the grid, same as heightAt", () => {
    expect(() => buildHouseBlocks(grid, 99, 0)).toThrow(RangeError);
  });
});
