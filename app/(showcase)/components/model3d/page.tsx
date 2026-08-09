"use client";

// Public showcase page for <Model3D>. This whole repo carries no gating of
// any kind (see CLAUDE.md's "Scope boundary" section).
//
// Sample glTF: public/model3d-samples/prado/model.glb — a REAL textured
// mesh from the operator's own 2806 Prado St nadir-grid photogrammetry
// (OpenDroneMap odm_texturing_25d output, converted via obj2gltf, then
// texture-resized to 512px + Draco-compressed via @gltf-transform/cli down
// to ~2MB from a raw ~29MB export). Released for public use by the
// property's owner — full release rights, distinct from the separate
// professional real-estate-shoot photos CLAUDE.md's stricter release-forms
// rule still covers. See docs/components/model3d.md's provenance section.
//
// The original public/model3d-samples/duck/model.glb (Khronos sample,
// CC0-equivalent) stays in the repo — <LandOverlay>'s showcase still uses
// it (see that page's own header comment for why: the real Prado mesh is
// Z-up in its raw ODM export, and LandOverlay's absolute map-alignment
// requirement needs an axis-correction pass this change didn't budget for;
// Model3D's plain orbit viewer has no such alignment requirement, so it
// was safe to swap here).
import dynamic from "next/dynamic";
import { ComponentShowcase } from "@/components/showcase";
import { withBasePath } from "@/lib/base-path";

// <Model3D> is a heavy client-only viewer (WebGL canvas via
// @react-three/fiber) — CLAUDE.md's "every heavy viewer =
// next/dynamic({ssr:false})" convention, same as
// app/dev-preview-model3d/page.tsx.
const Model3D = dynamic(() => import("@/components/Model3D").then((mod) => mod.Model3D), {
  ssr: false,
});

const USAGE_CODE = `import { Model3D } from "@/components/Model3D";

<Model3D
  model={{ id: "prado", url: "/model3d-samples/prado/model.glb", title: "2806 Prado (real photogrammetry mesh)" }}
/>`;

export default function Model3DShowcasePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 p-8">
      <ComponentShowcase
        title="Model3D"
        description="Orbit-and-measure 3D mesh / point-cloud viewer for a property's photogrammetry output."
        demo={
          <div className="h-[480px] w-full overflow-hidden rounded-xl bg-background">
            <Model3D
              model={{
                id: "prado",
                url: withBasePath("/model3d-samples/prado/model.glb"),
                title: "2806 Prado (real photogrammetry mesh)",
              }}
            />
          </div>
        }
        code={USAGE_CODE}
      />
    </main>
  );
}
