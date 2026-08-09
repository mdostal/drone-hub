import Link from "next/link";

// The real front door — the address an external link (tools.mdostal.com)
// would actually point at. Replaces the old one-line placeholder and
// absorbs app/(showcase)/components/page.tsx's 5-entry ToC (now deleted;
// see next.config.ts's /components -> / redirect and
// .pHive/epics/framework-docs-site/docs/design-discussion.md §2 for the
// full rationale — this is the "landing page consolidation" the redirect +
// deletion pattern exists for).
//
// Public — this whole repo carries no gating of any kind (see CLAUDE.md's
// "Scope boundary" section): drone-hub is the framework/component-library
// showcase only, real client-facing access control lives entirely in the
// separate personal-drone platform.
interface TocEntry {
  name: string;
  description: string;
  demoHref: string | null;
  demoLabel: string;
  docHref: string;
  note?: { text: string; href: string; label: string };
}

const TOC: TocEntry[] = [
  {
    name: "VideoTour",
    description: "Scrollytelling walkthrough that steps a floor plan through doorway-linked video clips.",
    demoHref: "/components/video-tour",
    demoLabel: "Live demo",
    docHref: "/docs/components/video-tour",
  },
  {
    name: "LayerViewer",
    description: "Toggleable, opacity-controlled georeferenced overlays draped on a satellite base map.",
    demoHref: "/components/layer-viewer",
    demoLabel: "Live demo",
    docHref: "/docs/components/layer-viewer",
  },
  {
    name: "Model3D",
    description: "Orbit-and-measure 3D mesh / point-cloud viewer for a property's photogrammetry output.",
    demoHref: "/components/model3d",
    demoLabel: "Live demo",
    docHref: "/docs/components/model3d",
  },
  {
    name: "LandOverlay",
    description:
      "A geo-anchored 3D model draped onto the georeferenced satellite map at a real lat/lon, alongside the ortho/hillshade/boundary layers.",
    demoHref: "/components/land-overlay",
    demoLabel: "Live demo",
    docHref: "/docs/components/land-overlay",
  },
  {
    name: "VoxelTerrain",
    description:
      "Blocky, Minecraft-style terrain renderer — a VoxelGrid of stacked, height-banded cubes with a sample structure on top, orbit-controllable.",
    demoHref: "/components/voxel-terrain",
    demoLabel: "Live demo",
    docHref: "/docs/components/voxel-terrain",
  },
  {
    name: "ContentEngine",
    description:
      "A per-property page composing VoxelTerrain plus sample engineering docs and flight-log telemetry — \"the engineering, the minecraft of it, the flight docs.\"",
    demoHref: "/properties/2806-prado/engine",
    demoLabel: "Live demo",
    docHref: "/docs/components/content-engine",
  },
  {
    name: "MinecraftExport",
    description:
      "Real, spec-compliant Minecraft Sponge Schematic (.schem) download generated from a VoxelGrid — not a page of its own, a download action.",
    demoHref: null,
    demoLabel: "",
    docHref: "/docs/components/minecraft-export",
    note: {
      text: "The live download action lives on the",
      href: "/components/voxel-terrain",
      label: "VoxelTerrain demo page",
    },
  },
  {
    name: "FileUpload",
    description: "A generic drag-and-drop + click-to-browse target — hands the caller a File[], no upload logic of its own.",
    demoHref: "/components/file-upload",
    demoLabel: "Live demo",
    docHref: "/docs/components/file-upload",
  },
  {
    name: "FileList",
    description:
      "Given a typed manifest of already-resolved file URLs, renders an icon/label-by-content-type list with a real download link per file.",
    demoHref: "/components/file-list",
    demoLabel: "Live demo",
    docHref: "/docs/components/file-list",
  },
  {
    name: "ProcessingStatus",
    description: "A typed queued/processing/done/error indicator — presentational only, no polling or websocket logic of its own.",
    demoHref: "/components/processing-status",
    demoLabel: "Live demo",
    docHref: "/docs/components/processing-status",
  },
  {
    name: "FlightCoverageAnalyzer",
    description:
      "Judges nadir drone passes for photogrammetric grid validity — green/amber/red verdict on side overlap and coverage, demoed against real flight telemetry.",
    demoHref: "/components/flight-coverage-analyzer",
    demoLabel: "Live demo",
    docHref: "/docs/components/flight-coverage-analyzer",
  },
  {
    name: "TourBuilder",
    description:
      "Visual authoring tool for VideoTour manifests — upload a floorplan, click to place rooms, wire up doorways, export a real, validated tour.json.",
    demoHref: "/components/tour-builder",
    demoLabel: "Live demo",
    docHref: "/docs/components/tour-builder",
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 p-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-foreground">Drone Hub</h1>
        <p className="text-muted">
          Plug-and-play React components for drone property intelligence. Each ships with a live demo and full
          docs.
        </p>
      </header>

      <ul className="grid gap-4 sm:grid-cols-2">
        {TOC.map((entry) => (
          <li
            key={entry.name}
            className="flex h-full flex-col gap-2 rounded-xl border border-border bg-surface p-4 transition-colors hover:border-accent/50"
          >
            <span className="text-lg font-medium text-foreground">{entry.name}</span>
            <span className="text-sm text-muted">{entry.description}</span>

            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
              {entry.demoHref && (
                <Link
                  href={entry.demoHref}
                  className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent transition-colors hover:border-accent/70 hover:bg-accent/20"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
                  {entry.demoLabel}
                </Link>
              )}
              <Link href={entry.docHref} className="font-medium text-accent underline hover:text-accent-dark">
                Docs
              </Link>
            </div>

            {entry.note && (
              <p className="mt-1 text-xs text-muted">
                {entry.note.text}{" "}
                <Link href={entry.note.href} className="underline hover:text-accent">
                  {entry.note.label}
                </Link>
                .
              </p>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
