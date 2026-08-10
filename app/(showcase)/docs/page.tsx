import Link from "next/link";

// The docs section's home — the real "explains it, has an about page,
// talks about the project" page the operator asked for on 2026-08-10.
// Static prose, no dynamic APIs, so it stays statically prerendered like
// every other page in this route group.
export default function DocsIntroductionPage() {
  return (
    <article>
      <h1 className="text-3xl font-semibold text-foreground">Introduction</h1>
      <p className="mt-4 text-base leading-relaxed text-muted">
        Drone Hub is a <strong className="text-foreground">shadcn-style component framework</strong> for
        drone property intelligence: plug-and-play React components you drop into your own app — a
        map layer viewer, a 3D/point-cloud viewer, a geo-anchored model overlay, a video walkthrough
        player, a Minecraft terrain voxelizer — not a single hosted product. The point is the
        components, not one page.
      </p>

      <h2 className="mt-10 text-xl font-semibold text-foreground">Why this exists</h2>
      <p className="mt-3 leading-relaxed text-muted">
        Property-intelligence viewers (draping a georeferenced ortho/thermal over a satellite base,
        toggling layers, orbiting a 3D reconstruction) are usually locked inside one SaaS product.
        Drone Hub takes the opposite bet: <strong className="text-foreground">build and own the
        viewer, buy only the heavy compute</strong> (photogrammetry processing), and ship the viewer
        itself as real, individually-importable components — the same shape as{" "}
        <a href="https://ui.shadcn.com" target="_blank" rel="noreferrer" className="text-accent hover:underline">
          shadcn/ui
        </a>
        , applied to drone data instead of form inputs.
      </p>

      <h2 className="mt-10 text-xl font-semibold text-foreground">What&apos;s actually real here</h2>
      <p className="mt-3 leading-relaxed text-muted">
        Every component on this site is demoed against real data, not mockups. LayerViewer, Model3D,
        VoxelTerrain, and LandOverlay run against a real OpenDroneMap reconstruction from an actual
        nadir-grid drone flight — a real orthomosaic, a real DSM, a real textured mesh — not a stock
        photo. VideoTour plays a real interior walkthrough from the same property. FlightCoverageAnalyzer
        judges the real GPS telemetry from that same flight. Where a component genuinely has no real
        counterpart yet (thermal imagery — no radiometric sensor owned yet; a real recorded parcel
        boundary), that gap is labeled honestly in its own docs page rather than faked.
      </p>

      <h2 className="mt-10 text-xl font-semibold text-foreground">The stack</h2>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted">
        <li>
          <strong className="text-foreground">Next.js 15 · React · Tailwind v4</strong> — the app and
          every component.
        </li>
        <li>
          <strong className="text-foreground">MapLibre GL + PMTiles/COG</strong> — the georeferenced
          map layer engine (LayerViewer, LandOverlay).
        </li>
        <li>
          <strong className="text-foreground">three.js / react-three-fiber / drei</strong> — the 3D
          mesh, point-cloud, and voxel-terrain renderers (Model3D, VoxelTerrain).
        </li>
        <li>
          <strong className="text-foreground">WebODM / GDAL / rio-cogeo / PDAL / exiftool</strong> —
          the post-processing pipeline that turns a raw drone flight into the ortho/DSM/mesh assets
          the components render. Lives in{" "}
          <a
            href="https://github.com/mdostal/drone-hub/tree/master/pipeline"
            target="_blank"
            rel="noreferrer"
            className="text-accent hover:underline"
          >
            <code>/pipeline</code>
          </a>
          , never bundled into the app itself.
        </li>
      </ul>

      <h2 className="mt-10 text-xl font-semibold text-foreground">Scope — what this repo is, and isn&apos;t</h2>
      <p className="mt-3 leading-relaxed text-muted">
        This repo is the framework and its own public showcase — fully public, no gating, no
        multi-tenant accounts, no billing. Real client-facing platform concerns (client accounts,
        per-client data isolation, contracts) belong to a separate, private platform repo that
        consumes these components as a package, not this one. If a page here needs real auth or
        real client data to make sense, that&apos;s a signal it belongs in that other repo, not here.
      </p>

      <h2 className="mt-10 text-xl font-semibold text-foreground">License</h2>
      <p className="mt-3 leading-relaxed text-muted">
        MIT licensed. Take any component, copy it into your own project, change what you need — that&apos;s
        the point.
      </p>

      <div className="mt-10 flex flex-wrap items-center gap-4 border-t border-border pt-6 text-sm">
        <Link href="/" className="text-accent hover:underline">
          ← Back to the component index
        </Link>
        <a
          href="https://github.com/mdostal/drone-hub"
          target="_blank"
          rel="noreferrer"
          className="text-muted hover:text-foreground"
        >
          Source on GitHub
        </a>
      </div>
    </article>
  );
}
