import Link from "next/link";

// Deliberately public: this route group is NOT in
// lib/gate.ts's GATED_PATH_PREFIXES / middleware.ts's config.matcher, on
// purpose — see this story's yaml (model3d-showcase-shell) and
// middleware.ts's header comment for the gated list this must stay outside
// of. A component-framework index (CLAUDE.md "Vision expansion": a
// shadcn-style component framework, every component gets its own showcase
// page) is documentation, not gated property footage.
interface ComponentEntry {
  name: string;
  description: string;
  href: string;
}

// Cards link to each component's own showcase page. Those pages
// (/components/video-tour, /components/layer-viewer, /components/model3d)
// are built by a sibling/later story in this epic — a 404 until they land
// is expected and fine (see this story's yaml). Using next/link (not a
// plain <a>) so they become real client-navigable routes the moment those
// pages exist, no wiring change needed here.
const COMPONENTS: ComponentEntry[] = [
  {
    name: "VideoTour",
    description: "Scrollytelling walkthrough that steps a floor plan through doorway-linked video clips.",
    href: "/components/video-tour",
  },
  {
    name: "LayerViewer",
    description: "Toggleable, opacity-controlled georeferenced overlays draped on a satellite base map.",
    href: "/components/layer-viewer",
  },
  {
    name: "Model3D",
    description: "Orbit-and-measure 3D mesh / point-cloud viewer for a property's photogrammetry output.",
    href: "/components/model3d",
  },
  {
    name: "LandOverlay",
    description: "A geo-anchored 3D model draped onto the georeferenced satellite map at a real lat/lon, alongside the ortho/hillshade/boundary layers.",
    href: "/components/land-overlay",
  },
];

export default function ComponentsIndexPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 p-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Components</h1>
        <p className="text-neutral-600">
          Plug-and-play React components for drone property intelligence — each with a live demo and a usage
          snippet.
        </p>
      </header>

      <ul className="grid gap-4 sm:grid-cols-2">
        {COMPONENTS.map((component) => (
          <li key={component.href}>
            <Link
              href={component.href}
              className="flex h-full flex-col gap-2 rounded-lg border p-4 transition-colors hover:border-neutral-400"
            >
              <span className="text-lg font-medium">{component.name}</span>
              <span className="text-sm text-neutral-600">{component.description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
