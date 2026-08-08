"use client";

import dynamic from "next/dynamic";
import type { FlightLogEntry } from "@/lib/flight-log-types";
import type { VoxelGrid } from "@/lib/voxel-types";

// <VoxelScene> (this folder's VoxelScene.tsx) wraps <VoxelTerrain> +
// <VoxelStructure> — a heavy client-only WebGL viewer
// (@react-three/fiber's <Canvas>, same stack as <Model3D>) — CLAUDE.md's
// "every heavy viewer = next/dynamic({ssr:false})" convention, same as
// app/properties/[slug]/page.tsx does for <LayerViewer>. This is the "use
// client" boundary page.tsx (the Server Component parent) can't provide
// itself: Next's App Router rejects `ssr: false` on next/dynamic called
// directly inside a Server Component, so the fs-reading data resolution
// stays server-side in page.tsx and only the actual rendering — including
// this dynamic import — happens here.
const VoxelScene = dynamic(() => import("./VoxelScene").then((mod) => mod.VoxelScene), {
  ssr: false,
});

export interface EnginePageClientProps {
  slug: string;
  /** True when public/content-engine/<slug>/{engineering.md,flight-log.json}
   *  was missing and page.tsx fell back to the generic sample-house
   *  dataset — drives the visible fallback banner below. */
  isFallback: boolean;
  engineeringMarkdown: string;
  flightLog: FlightLogEntry[];
  grid: VoxelGrid;
}

export function EnginePageClient({
  slug,
  isFallback,
  engineeringMarkdown,
  flightLog,
  grid,
}: EnginePageClientProps) {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 p-6 md:p-8">
      <header>
        <h1 className="text-2xl font-semibold">Content Engine — {slug}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          The engineering, the Minecraft of it, the flight docs.
        </p>
      </header>

      {isFallback && (
        // The story's #1 requirement: a genuinely VISIBLE banner, not a
        // small footnote — this is the fix for the rights/trust concern
        // design-discussion.md point 5 raised: a gated page silently
        // showing generic public demo content would misleadingly imply
        // exclusivity. Full-width, high-contrast, top-of-page, with
        // role="alert" for the same reason app/enter-passcode/page.tsx and
        // components/LayerViewer/LayerViewer.tsx use it on their own
        // user-facing status messages — assistive tech announces it
        // immediately rather than it being silently skippable.
        <div
          role="alert"
          className="rounded-md border-2 border-amber-500 bg-amber-100 p-4 text-base font-semibold text-amber-900 dark:border-amber-400 dark:bg-amber-950 dark:text-amber-100"
        >
          Showing sample data — no real records exist yet for this property.
        </div>
      )}

      <section aria-labelledby="engine-terrain-heading" className="flex flex-col gap-2">
        <h2 id="engine-terrain-heading" className="text-lg font-medium">
          The Minecraft of It
        </h2>
        {/* Sample terrain is shared regardless of slug — see page.tsx's
            TERRAIN_SAMPLE_SLUG comment: this is a separate concern from the
            engineering/flight-log fallback above, not itself driven by
            `isFallback`. */}
        <div className="h-[420px] w-full overflow-hidden rounded-md bg-neutral-900">
          <VoxelScene grid={grid} />
        </div>
        {/* Uses this page's own real `slug` prop, not a hardcoded sample —
            app/api/minecraft-export/route.ts falls back to its
            DEFAULT_SLUG ("2806-prado") today because that's the only slug
            with sample data on disk, but this link always requests the
            slug this page is actually showing so a future real
            public/minecraft-samples/<slug>/heightmap.json is picked up
            automatically, no code change needed here. */}
        <a
          href={`/api/minecraft-export?slug=${encodeURIComponent(slug)}`}
          download
          className="inline-flex w-fit items-center gap-2 rounded-md border border-neutral-300 bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 dark:border-neutral-700"
        >
          Download for Minecraft
        </a>
      </section>

      <section aria-labelledby="engine-engineering-heading" className="flex flex-col gap-2">
        <h2 id="engine-engineering-heading" className="text-lg font-medium">
          Engineering
        </h2>
        {/* No markdown-rendering library is currently a dependency (checked
            package.json — none of markdown/remark/mdx/etc. are present),
            and this epic's content is short, already-readable structured
            markdown (headings/lists/a table) — plain preformatted text is
            fully readable as-is and avoids both adding a new dependency for
            a single display-only panel and the dangerouslySetInnerHTML risk
            of a hand-rolled HTML converter. `whitespace-pre-wrap` preserves
            the source's line breaks while still wrapping long lines. */}
        <pre className="overflow-x-auto whitespace-pre-wrap rounded-md border border-neutral-200 bg-neutral-50 p-4 font-mono text-sm dark:border-neutral-800 dark:bg-neutral-900">
          {engineeringMarkdown}
        </pre>
      </section>

      <section aria-labelledby="engine-flight-log-heading" className="flex flex-col gap-2">
        <h2 id="engine-flight-log-heading" className="text-lg font-medium">
          Flight Log
        </h2>
        <div className="overflow-x-auto rounded-md border border-neutral-200 dark:border-neutral-800">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900">
                <th scope="col" className="p-2 font-medium">
                  Time
                </th>
                <th scope="col" className="p-2 font-medium">
                  Latitude
                </th>
                <th scope="col" className="p-2 font-medium">
                  Longitude
                </th>
                <th scope="col" className="p-2 font-medium">
                  Altitude (m)
                </th>
              </tr>
            </thead>
            <tbody>
              {flightLog.map((entry) => (
                // timestampMs is monotonic and unique per FlightLogEntry
                // (one row per telemetry sample) — a stable, meaningful key,
                // not an index.
                <tr key={entry.timestampMs} className="border-b border-neutral-100 last:border-0 dark:border-neutral-900">
                  <td className="p-2 tabular-nums">{(entry.timestampMs / 1000).toFixed(1)}s</td>
                  <td className="p-2 tabular-nums">{entry.lat.toFixed(5)}</td>
                  <td className="p-2 tabular-nums">{entry.lon.toFixed(5)}</td>
                  <td className="p-2 tabular-nums">{entry.altitudeMeters.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
