"use client";

// Public showcase page for <VoxelTerrain> (+ <VoxelStructure>). This whole
// repo carries no gating of any kind (see CLAUDE.md's "Scope boundary"
// section). Sample data is public/minecraft-samples/2806-prado/heightmap.json
// — already-confirmed public-safe derived terrain (see VoxelTerrainDemo.tsx's
// header comment), not raw property photogrammetry.
import dynamic from "next/dynamic";
import Link from "next/link";
import { ComponentShowcase } from "@/components/showcase";

// <VoxelTerrain>/<VoxelStructure> are heavy client-only WebGL viewers
// (@react-three/fiber's <Canvas>) — CLAUDE.md's "every heavy viewer =
// next/dynamic({ssr:false})" convention, same as
// app/(showcase)/components/model3d/page.tsx. The composition (terrain +
// structure child) lives in the single VoxelTerrainDemo client component so
// there's only one next/dynamic boundary across the shared r3f Canvas tree
// — see VoxelTerrainDemo.tsx's header comment.
const VoxelTerrainDemo = dynamic(() => import("./VoxelTerrainDemo"), {
  ssr: false,
});

const USAGE_CODE = `import { VoxelTerrain, VoxelStructure } from "@/components/VoxelTerrain";
import sampleGrid from "@/public/minecraft-samples/2806-prado/heightmap.json";

<VoxelTerrain grid={sampleGrid}>
  <VoxelStructure grid={sampleGrid} gridX={16} gridZ={16} />
</VoxelTerrain>`;

export default function VoxelTerrainShowcasePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 p-8">
      <ComponentShowcase
        title="VoxelTerrain"
        description="Blocky, Minecraft-style terrain renderer — a VoxelGrid of stacked, height-banded cubes with a sample structure resting on top, orbit-controllable."
        demo={
          <div className="flex flex-col gap-3">
            <div className="h-[480px] w-full overflow-hidden rounded-md bg-neutral-900">
              <VoxelTerrainDemo />
            </div>
            {/* Ties the export directly to this sample terrain — the same
                public/minecraft-samples/2806-prado/heightmap.json data
                VoxelTerrainDemo.tsx renders above, via
                app/api/minecraft-export/route.ts (its DEFAULT_SLUG). A plain
                download-anchor is deliberately all this needs (per this
                story's yaml): the browser's native download handling covers
                it, no client state/loading-spinner required. */}
            {/* next/link, not a raw <a> — Link's href gets Next's automatic
                basePath prefixing (the mount-under-tools.mdostal.com/framework
                multi-zone setup, see next.config.ts), which a hardcoded
                absolute href would not; the `download` attribute still passes
                through to the rendered anchor unchanged. */}
            <Link
              href="/api/minecraft-export?slug=2806-prado"
              download
              className="inline-flex w-fit items-center gap-2 rounded-md border border-neutral-300 bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 dark:border-neutral-700"
            >
              Download for Minecraft
            </Link>
          </div>
        }
        code={USAGE_CODE}
      />
    </main>
  );
}
