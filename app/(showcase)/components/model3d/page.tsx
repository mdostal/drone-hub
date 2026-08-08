"use client";

// Public showcase page for <Model3D> — this route group is deliberately NOT
// in lib/gate.ts's GATED_PATH_PREFIXES / middleware.ts's matcher, same as
// app/(showcase)/components/page.tsx. Sample glTF (duck) is a generic,
// public-safe placeholder asset — not property photogrammetry output.
import dynamic from "next/dynamic";
import { ComponentShowcase } from "@/components/showcase";

// <Model3D> is a heavy client-only viewer (WebGL canvas via
// @react-three/fiber) — CLAUDE.md's "every heavy viewer =
// next/dynamic({ssr:false})" convention, same as
// app/dev-preview-model3d/page.tsx.
const Model3D = dynamic(() => import("@/components/Model3D").then((mod) => mod.Model3D), {
  ssr: false,
});

const USAGE_CODE = `import { Model3D } from "@/components/Model3D";

<Model3D
  model={{ id: "duck", url: "/model3d-samples/duck/model.glb", title: "Duck (sample glTF)" }}
/>`;

export default function Model3DShowcasePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 p-8">
      <ComponentShowcase
        title="Model3D"
        description="Orbit-and-measure 3D mesh / point-cloud viewer for a property's photogrammetry output."
        demo={
          <div className="h-[480px] w-full overflow-hidden rounded-md bg-neutral-900">
            <Model3D model={{ id: "duck", url: "/model3d-samples/duck/model.glb", title: "Duck (sample glTF)" }} />
          </div>
        }
        code={USAGE_CODE}
      />
    </main>
  );
}
