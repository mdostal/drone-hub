import Link from "next/link";

// The real front door — the address an external link (tools.mdostal.com)
// would actually point at. Replaces the old one-line placeholder and
// absorbs app/(showcase)/components/page.tsx's 5-entry ToC (now deleted;
// see next.config.ts's /components -> / redirect and
// .pHive/epics/framework-docs-site/docs/design-discussion.md §2 for the
// full rationale — this is the "landing page consolidation" the redirect +
// deletion pattern exists for).
//
// Deliberately public: same reasoning as the old (showcase)/components
// page — this route is NOT in lib/gate.ts's GATED_PATH_PREFIXES /
// middleware.ts's config.matcher. A component-framework ToC is
// documentation, not gated property footage. (The ContentEngine entry's
// *demo* link below points into the gated /properties/* tree — the card
// says so explicitly rather than linking silently into a login redirect.)
interface TocEntry {
  name: string;
  description: string;
  demoHref: string | null;
  demoLabel: string;
  demoGated?: boolean;
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
      "A gated, per-property page composing VoxelTerrain plus sample engineering docs and flight-log telemetry — \"the engineering, the minecraft of it, the flight docs.\"",
    demoHref: "/properties/2806-prado/engine",
    demoLabel: "Live demo",
    demoGated: true,
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
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 p-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Drone Hub</h1>
        <p className="text-neutral-600">
          Plug-and-play React components for drone property intelligence. Each ships with a live demo and full
          docs.
        </p>
      </header>

      <ul className="grid gap-4 sm:grid-cols-2">
        {TOC.map((entry) => (
          <li key={entry.name} className="flex h-full flex-col gap-2 rounded-lg border p-4">
            <span className="text-lg font-medium">{entry.name}</span>
            <span className="text-sm text-neutral-600">{entry.description}</span>

            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
              {entry.demoHref && (
                <Link href={entry.demoHref} className="font-medium underline hover:text-neutral-600">
                  {entry.demoLabel}
                </Link>
              )}
              <Link href={entry.docHref} className="font-medium underline hover:text-neutral-600">
                Docs
              </Link>
              {entry.demoGated && (
                <span className="rounded-full border border-amber-400 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                  passcode-gated demo
                </span>
              )}
            </div>

            {entry.note && (
              <p className="mt-1 text-xs text-neutral-500">
                {entry.note.text}{" "}
                <Link href={entry.note.href} className="underline hover:text-neutral-700">
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
