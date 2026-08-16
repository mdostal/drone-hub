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
// it. The real Prado mesh's Draco-decoded winding renders back-facing from
// most angles a plain orbit viewer would use — corrected below via
// `fixWinding: true` on the model prop (ModelDef's own doc comment /
// GltfScene's in components/Model3D/Model3D.tsx have the full story). NOT
// an axis/orientation fix: obj2gltf already bakes the correct Z-up -> Y-up
// correction into the file's own root-node transform, so no extra rotation
// belongs here — an earlier version of this field wrongly added one
// (named `upAxis`, applying its own -90° X rotation on top of the file's
// already-correct one), which is exactly why a real user reported the
// model "wasn't allowing it to turn and it was aimed at the underside."
//
// terrain.glb (ModelDef.terrainUrl): a real terrain-surface mesh baked
// from the same job's real DSM (odm_dem/dsm.tif) via
// pipeline/scripts/dsm-to-terrain-mesh.py, aligned to model.glb's own
// local coordinate frame (same coords.txt UTM offset + Y-up convention
// crop-mesh.py established). Renders beneath the photogrammetry mesh so
// real reconstruction holes (occlusion under tree canopy, insufficient
// camera overlap — see pipeline/scripts/detect-coverage-gaps.py's own real
// findings for this property) show real terrain instead of blank canvas
// background — "meld the model" per the operator's own framing. See
// ModelDef.terrainUrl's doc comment in components/Model3D/Model3D.tsx.
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
  model={{
    id: "prado",
    url: "/model3d-samples/prado/model.glb",
    title: "2806 Prado (real photogrammetry mesh)",
    fixWinding: true,
    // Real DSM-derived terrain surface, rendered beneath the mesh so real
    // reconstruction holes show terrain instead of blank background.
    terrainUrl: "/model3d-samples/prado/terrain.glb",
  }}
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
                fixWinding: true,
                terrainUrl: withBasePath("/model3d-samples/prado/terrain.glb"),
              }}
            />
          </div>
        }
        code={USAGE_CODE}
      />
    </main>
  );
}
